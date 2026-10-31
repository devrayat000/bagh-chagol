// The TypeScript four-in-a-row rules and network input must match fourrow/game.py
// exactly. The fixtures are written by `uv run --group web export_web.py fourrow`.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import * as ort from "onnxruntime-web";
import { NetEvaluator } from "../src/ai/evaluators";
import { search } from "../src/ai/mcts";
import { FourRowRolloutEvaluator, threats, winningMoves } from "../src/fourrow/evaluators";
import { FourRowState, type FourRowDef, type Side } from "../src/fourrow/rules";

const publicDir = new URL("../public/fourrow/", import.meta.url);
const def: FourRowDef = JSON.parse(readFileSync(new URL("game.json", publicDir), "utf8"));

interface Case {
  grid: number[];
  toPlay: Side;
  ply: number;
  last: number;
  legal: number[];
  winner: Side | "draw" | null;
  winningCells: number[];
  planes: number[];
  logits?: number[];
  value?: number;
}

const cases: Case[] = JSON.parse(readFileSync(new URL("./fixtures/fourrow.json", import.meta.url), "utf8")).cases;
const state = (c: Case) => new FourRowState(def, Int8Array.from(c.grid), c.toPlay, c.ply, c.last);
const play = (...cols: number[]) => cols.reduce((s, c) => s.apply(c), FourRowState.initial(def));

describe("four-in-a-row", () => {
  test("start position matches", () => {
    const s = FourRowState.initial(def);
    expect(Array.from(s.grid)).toEqual(cases[0].grid);
    expect(s.toPlay).toBe(cases[0].toPlay);
  });

  test("legal moves, winners and winning lines match Python", () => {
    for (const c of cases) {
      const s = state(c);
      expect(s.legalActions()).toEqual(c.legal);
      expect(s.winner()).toEqual(c.winner);
      if (c.winner !== null && c.winner !== "draw") expect([...s.winningCells()].sort((a, b) => a - b)).toEqual(c.winningCells);
    }
  });

  test("dropping a piece gives Python's next position", () => {
    for (let i = 0; i + 1 < cases.length; i++) {
      const s = state(cases[i]);
      if (s.isTerminal() || cases[i + 1].ply !== s.ply + 1) continue;
      const next = s.legalActions().map((a) => s.apply(a));
      expect(next.some((n) => Array.from(n.grid).join() === cases[i + 1].grid.join() && n.last === cases[i + 1].last)).toBe(true);
    }
  });

  test("network input planes match Python", () => {
    for (const c of cases) expect(Array.from(state(c).encode())).toEqual(c.planes);
  });

  const modelPath = new URL("model.onnx", publicDir);
  test.runIf(existsSync(modelPath))("ONNX network output matches PyTorch", async () => {
    const session = await ort.InferenceSession.create(readFileSync(modelPath));
    const net = new NetEvaluator(session, ort.Tensor);
    for (const c of cases.filter((c) => c.logits).slice(0, 40)) {
      const { priors, value } = await net.evaluate(state(c));
      expect(value).toBeCloseTo(c.value!, 3);
      const exps = c.logits!.map((l) => Math.exp(l - Math.max(...c.logits!)));
      const sum = exps.reduce((a, b) => a + b, 0);
      priors.forEach((p, i) => expect(p).toBeCloseTo(exps[i] / sum, 3));
    }
  });

  test("win and block helpers", () => {
    // red has 0,1,2 on the bottom row; yellow (to move) must block column 3
    const s = play(0, 6, 1, 6, 2);
    expect(threats(s)).toEqual([3]);
    expect(winningMoves(s)).toEqual([]);
    expect(winningMoves(s.apply(5))).toEqual([3]);
  });

  test("search without a network finds the winning move and the block", async () => {
    const evaluator = new FourRowRolloutEvaluator();
    const win = play(0, 6, 1, 6, 2, 5); // red to move, wins in column 3
    let { visits } = await search(win, evaluator, 200);
    expect([...visits].sort((a, b) => b[1] - a[1])[0][0]).toBe(3);
    ({ visits } = await search(play(0, 6, 1, 6, 2), evaluator, 200)); // yellow must block column 3
    expect([...visits].sort((a, b) => b[1] - a[1])[0][0]).toBe(3);
  });
});
