// PUCT Monte Carlo Tree Search - a port of bagh/mcts.py.
//
// Each simulation walks down the tree picking the child with the best
//     Q + c_puct * P * sqrt(N_parent) / (1 + N_child)
// evaluates the new leaf with the network (priors + value), and backs the
// value up the path, flipping its sign at every level.

import { State } from "../rules";

export interface Evaluation {
  priors: Float32Array; // one per legal action, in state.legalActions() order
  value: number; // expected result for the side to move, in [-1, 1]
}

export interface Evaluator {
  evaluate(state: State): Promise<Evaluation>;
}

class Node {
  children: Map<number, Node> | null = null;
  n = 0;
  w = 0; // total value, from the view of the player who moved INTO this node
  constructor(public prior: number, public state: State | null = null) {}
}

function outcome(state: State): number {
  const w = state.winner();
  if (w === "draw") return 0;
  return w === state.toPlay ? 1 : -1;
}

export interface SearchResult {
  visits: Map<number, number>; // action -> visit count
  value: number; // root value for the side to move
}

export async function search(root: State, evaluator: Evaluator, sims: number, cPuct = 1.5): Promise<SearchResult> {
  const rootNode = new Node(1, root);
  expand(rootNode, (await evaluator.evaluate(root)).priors);

  for (let i = 0; i < sims; i++) {
    const path = select(rootNode, cPuct);
    const leaf = path[path.length - 1];
    if (leaf.state!.isTerminal()) {
      backup(path, outcome(leaf.state!)); // real result, no network needed
    } else {
      const { priors, value } = await evaluator.evaluate(leaf.state!);
      expand(leaf, priors);
      backup(path, value);
    }
  }

  const visits = new Map<number, number>();
  for (const [a, child] of rootNode.children!) visits.set(a, child.n);
  return { visits, value: -rootNode.w / Math.max(rootNode.n, 1) };
}

function select(root: Node, cPuct: number): Node[] {
  let node = root;
  const path = [root];
  while (node.children !== null) {
    const sqrtN = Math.sqrt(Math.max(node.n, 1));
    let bestScore = -Infinity, bestA = -1, best: Node | null = null;
    for (const [a, child] of node.children) {
      const q = child.n ? child.w / child.n : 0;
      const score = q + (cPuct * child.prior * sqrtN) / (1 + child.n);
      if (score > bestScore) [bestScore, bestA, best] = [score, a, child];
    }
    if (best!.state === null) best!.state = node.state!.apply(bestA);
    node = best!;
    path.push(node);
  }
  return path;
}

function expand(node: Node, priors: Float32Array) {
  const legal = node.state!.legalActions();
  node.children = new Map(legal.map((a, i) => [a, new Node(priors[i])]));
}

function backup(path: Node[], value: number) {
  for (let i = path.length - 1; i >= 0; i--) {
    path[i].n += 1;
    path[i].w -= value;
    value = -value;
  }
}

/** temperature 0 -> most visited move (ties broken randomly); higher -> more random. */
export function pickAction(visits: Map<number, number>, temperature: number): number {
  const actions = [...visits.keys()];
  const counts = actions.map((a) => visits.get(a)!);
  if (temperature <= 1e-6) {
    const max = Math.max(...counts);
    const best = actions.filter((_, i) => counts[i] === max);
    return best[Math.floor(Math.random() * best.length)];
  }
  const weights = counts.map((c) => Math.pow(c, 1 / temperature));
  let r = Math.random() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < actions.length; i++) {
    r -= weights[i];
    if (r <= 0) return actions[i];
  }
  return actions[actions.length - 1];
}
