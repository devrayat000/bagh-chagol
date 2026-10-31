import type { InferenceSession, Tensor } from "onnxruntime-web";
import { GOAT, NUM_PLANES, State, TIGER_SIDE } from "../rules";
import type { Evaluation, Evaluator } from "./mcts";

type TensorCtor = new (type: "float32", data: Float32Array, dims: number[]) => Tensor;

/** The trained policy/value network, exported from PyTorch to ONNX. */
export class NetEvaluator implements Evaluator {
  private cache = new Map<string, Evaluation>(); // transpositions are common in these games

  constructor(private session: InferenceSession, private TensorClass: TensorCtor) {}

  async evaluate(state: State): Promise<Evaluation> {
    const key = `${state.board.join("")}|${state.toPlay}|${state.captures}|${state.ply}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const { rows, cols } = state.geo.def;
    const input = new this.TensorClass("float32", state.encode(), [1, NUM_PLANES, rows, cols]);
    const out = await this.session.run({ planes: input });
    const logits = out.policy.data as Float32Array;
    const value = (out.value.data as Float32Array)[0];

    // Softmax over the legal moves only (illegal moves are masked out).
    const legal = state.legalActions();
    const priors = new Float32Array(legal.length);
    let max = -Infinity;
    for (let i = 0; i < legal.length; i++) max = Math.max(max, logits[legal[i]]);
    let sum = 0;
    for (let i = 0; i < legal.length; i++) sum += priors[i] = Math.exp(logits[legal[i]] - max);
    for (let i = 0; i < legal.length; i++) priors[i] /= sum;

    const result = { priors, value };
    if (this.cache.size > 200_000) this.cache.clear();
    this.cache.set(key, result);
    return result;
  }
}

/**
 * Fallback for maps without a trained network: classic MCTS with random playouts.
 * Priors favour captures; the value is the result of a few quick games where the
 * tiger grabs captures and the goats avoid handing them over.
 */
export class RolloutEvaluator implements Evaluator {
  constructor(private playouts = 2, private depth = 40) {}

  async evaluate(state: State): Promise<Evaluation> {
    const legal = state.legalActions();
    const weights = legal.map((a) => (state.isCapture(a) ? 4 : 1));
    const total = weights.reduce((s, w) => s + w, 0);
    const priors = Float32Array.from(weights, (w) => w / total);

    let value = 0;
    for (let i = 0; i < this.playouts; i++) value += this.playout(state);
    return { priors, value: value / this.playouts };
  }

  private playout(start: State): number {
    let s = start;
    for (let d = 0; d < this.depth && !s.isTerminal(); d++) s = s.apply(this.rolloutMove(s));
    const w = s.winner();
    let tigerValue: number;
    if (w === "draw") tigerValue = 0;
    else if (w !== null) tigerValue = w === TIGER_SIDE ? 1 : -1;
    else {
      // Unfinished: judge by captures so far and how free the tiger is.
      const k = s.game.map.rules.capturesToWin;
      const tigerMoves = s.toPlay === TIGER_SIDE ? s.legalActions().length : 3;
      tigerValue = Math.tanh((2.5 * s.captures) / k - 0.6 + 0.08 * (tigerMoves - 3));
    }
    return start.toPlay === TIGER_SIDE ? tigerValue : -tigerValue;
  }

  private rolloutMove(s: State): number {
    const legal = s.legalActions();
    if (s.toPlay === TIGER_SIDE) {
      const captures = legal.filter((a) => s.isCapture(a));
      const pool = captures.length ? captures : legal;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    // Goats: prefer moves after which no goat can be jumped.
    const safe = legal.filter((a) => {
      const next = s.apply(a);
      return !next.legalActions().some((b) => next.isCapture(b));
    });
    const pool = safe.length ? safe : legal;
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

export function countGoats(s: State): number {
  return s.board.reduce((n, x) => n + (x === GOAT ? 1 : 0), 0);
}
