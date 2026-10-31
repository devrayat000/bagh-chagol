// The TypeScript rules and network input must match Python exactly, or the
// trained network would see inputs it never saw in training. The fixtures are
// written by `uv run --group web export_web.py`.

import { readFileSync, existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import * as ort from "onnxruntime-web";
import { Game, State, type MapDef, type Side } from "../src/rules";
import { NetEvaluator, RolloutEvaluator } from "../src/ai/evaluators";
import { search } from "../src/ai/mcts";

const MAPS = ["hourglass", "tiny", "small", "full"];
const publicDir = new URL("../public/maps/", import.meta.url);

interface Case {
  board: number[];
  toPlay: Side;
  captures: number;
  ply: number;
  legal: number[];
  winner: Side | "draw" | null;
  planes: number[];
  logits?: number[];
  value?: number;
}

function load(name: string) {
  const map: MapDef = JSON.parse(readFileSync(new URL(`${name}/game.json`, publicDir), "utf8"));
  const cases: Case[] = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")).cases;
  const game = new Game(map);
  const state = (c: Case) => new State(game, Int8Array.from(c.board), c.toPlay, c.captures, c.ply);
  return { map, cases, game, state };
}

describe.each(MAPS)("%s", (name) => {
  const { cases, game, state } = load(name);

  test("start position matches", () => {
    const s = game.initial();
    expect(Array.from(s.board)).toEqual(cases[0].board);
    expect(s.toPlay).toBe(cases[0].toPlay);
  });

  test("legal moves and winners match Python", () => {
    for (const c of cases) {
      const s = state(c);
      expect([...s.legalActions()].sort((a, b) => a - b)).toEqual(c.legal);
      expect(s.winner()).toEqual(c.winner);
    }
  });

  test("captures remove the jumped goat", () => {
    for (let i = 0; i + 1 < cases.length; i++) {
      const s = state(cases[i]);
      if (s.isTerminal() || cases[i + 1].ply !== s.ply + 1) continue;
      // The fixture's next position was produced by one of these moves.
      const next = s.legalActions().map((a) => s.apply(a));
      expect(next.some((n) => Array.from(n.board).join() === cases[i + 1].board.join())).toBe(true);
    }
  });

  test("network input planes match Python", () => {
    for (const c of cases) {
      const planes = state(c).encode();
      expect(planes.length).toBe(c.planes.length);
      for (let i = 0; i < planes.length; i++) expect(planes[i]).toBeCloseTo(c.planes[i], 6);
    }
  });

  const modelPath = new URL(`${name}/model.onnx`, publicDir);
  test.runIf(existsSync(modelPath))("ONNX network output matches PyTorch", async () => {
    const session = await ort.InferenceSession.create(readFileSync(modelPath));
    const net = new NetEvaluator(session, ort.Tensor);
    for (const c of cases.filter((c) => c.logits).slice(0, 40)) {
      const s = state(c);
      const { priors, value } = await net.evaluate(s);
      expect(value).toBeCloseTo(c.value!, 3);
      const exps = c.logits!.map((l) => Math.exp(l - Math.max(...c.logits!)));
      const sum = exps.reduce((a, b) => a + b, 0);
      priors.forEach((p, i) => expect(p).toBeCloseTo(exps[i] / sum, 3));
    }
  });
});

test("search finds a capture that wins the game", async () => {
  const { game } = load("tiny");
  // 3x3, 1 capture wins: tiger on a3 (point 0), goat on b3 (1), c3 (2) empty.
  const board = Int8Array.from([1, 2, 0, 0, 0, 0, 2, 2, 0]);
  const s = new State(game, board, 0, 0, 0);
  const { visits } = await search(s, new RolloutEvaluator(), 60);
  const best = [...visits].sort((a, b) => b[1] - a[1])[0][0];
  expect(s.isCapture(best)).toBe(true);
});
