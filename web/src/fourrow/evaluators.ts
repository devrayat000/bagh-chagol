import type { Evaluation, Evaluator } from "../ai/mcts";
import { FourRowState } from "./rules";

/** Moves that win on the spot for the side to move. */
export function winningMoves(s: FourRowState): number[] {
  return s.legalActions().filter((a) => s.apply(a).winner() === s.toPlay);
}

/** Columns the opponent would win with if it were their turn: the side to move must block one. */
export function threats(s: FourRowState): number[] {
  const flipped = new FourRowState(s.def, s.grid, (1 - s.toPlay) as 0 | 1, s.ply);
  return winningMoves(flipped);
}

/**
 * Fallback for when no trained network is available: classic MCTS with quick playouts.
 * Priors favour the centre (more lines pass through it), winning moves and blocks;
 * the value is the average result of a few games where both sides win when they
 * can, block when they must, and otherwise play a centre-leaning random move.
 */
export class FourRowRolloutEvaluator implements Evaluator<FourRowState> {
  constructor(private playouts = 2) {}

  async evaluate(state: FourRowState): Promise<Evaluation> {
    const legal = state.legalActions();
    const wins = new Set(winningMoves(state));
    const blocks = new Set(threats(state));
    const mid = (state.def.cols - 1) / 2;
    const weights = legal.map((a) => (wins.has(a) ? 20 : blocks.has(a) ? 8 : 1 + (mid - Math.abs(a - mid)) / mid));
    const total = weights.reduce((s, w) => s + w, 0);
    const priors = Float32Array.from(weights, (w) => w / total);

    let value = 0;
    for (let i = 0; i < this.playouts; i++) value += this.playout(state);
    return { priors, value: value / this.playouts };
  }

  private playout(start: FourRowState): number {
    let s = start;
    while (!s.isTerminal()) s = s.apply(rolloutMove(s));
    const w = s.winner();
    if (w === "draw") return 0;
    return w === start.toPlay ? 1 : -1;
  }
}

function rolloutMove(s: FourRowState): number {
  const wins = winningMoves(s);
  if (wins.length) return wins[0];
  const blocks = threats(s);
  if (blocks.length) return blocks[0];
  const legal = s.legalActions();
  const mid = (s.def.cols - 1) / 2;
  const weights = legal.map((a) => 1 + (mid - Math.abs(a - mid)));
  let r = Math.random() * weights.reduce((t, w) => t + w, 0);
  for (let i = 0; i < legal.length; i++) if ((r -= weights[i]) <= 0) return legal[i];
  return legal[legal.length - 1];
}
