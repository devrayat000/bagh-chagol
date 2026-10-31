"""Monte Carlo Tree Search guided by the network (the "PUCT" variant from AlphaZero).

Each simulation walks from the root down the tree, at every node picking the
child that maximises

    Q(child) + c_puct * P(child) * sqrt(N(parent)) / (1 + N(child))
    ^ how good it looked so far    ^ prior from the net, shrinking as we visit it more

until it reaches a node never seen before. The network evaluates that leaf
(priors for its children + a value), and the value is passed back up the path,
flipping sign at each level because the players alternate.

After all simulations the visit counts N(child) at the root are a much better
policy than the raw network output. That improved policy is both what we play
and what we train the network to imitate.

Batching: `search` runs the trees of many games side by side and sends one leaf
per tree to the network in a single batch, so the GPU sees big batches even
though each tree is searched sequentially.
"""

from __future__ import annotations

import math

import numpy as np

from .spec import outcome


class Node:
    __slots__ = ("state", "prior", "children", "n", "w")

    def __init__(self, prior: float, state=None):
        self.state = state  # filled in lazily the first time we visit the node
        self.prior = prior
        self.children: dict[int, Node] | None = None  # None = not expanded yet
        self.n = 0  # visit count
        self.w = 0.0  # total value, from the view of the player who moved INTO this node


class MCTS:
    def __init__(self, evaluator, sims: int = 100, c_puct: float = 1.5, dirichlet_alpha: float = 0.3,
                 dirichlet_eps: float = 0.25, seed: int | None = None):  # fmt: skip
        self.evaluator = evaluator
        self.sims = sims
        self.c_puct = c_puct
        self.dirichlet_alpha = dirichlet_alpha
        self.dirichlet_eps = dirichlet_eps
        self.rng = np.random.default_rng(seed)

    def search(self, states: list, add_noise: bool = False) -> tuple[list[np.ndarray], list[float]]:
        """Search every state. Returns visit counts over all actions, and the root value for the side to move."""
        roots = [Node(1.0, s) for s in states]
        priors, _ = self.evaluator(states)
        for root, p in zip(roots, priors):
            self._expand(root, p)
            if add_noise:  # exploration: perturb root priors so self-play tries new ideas
                noise = self.rng.dirichlet([self.dirichlet_alpha] * len(p))
                for child, eta in zip(root.children.values(), noise):
                    child.prior = (1 - self.dirichlet_eps) * child.prior + self.dirichlet_eps * eta

        for _ in range(self.sims):
            pending = []
            for root in roots:
                path = self._select(root)
                leaf = path[-1]
                w = leaf.state.winner()
                if w is not None:
                    self._backup(path, outcome(w, leaf.state.to_play))  # real result, no net needed
                else:
                    pending.append(path)
            if pending:
                priors, values = self.evaluator([path[-1].state for path in pending])
                for path, p, v in zip(pending, priors, values):
                    self._expand(path[-1], p)
                    self._backup(path, float(v))

        num_actions = states[0].num_actions
        visits, root_values = [], []
        for root in roots:
            v = np.zeros(num_actions, np.float32)
            for a, child in root.children.items():
                v[a] = child.n
            visits.append(v)
            root_values.append(-root.w / max(root.n, 1))
        return visits, root_values

    def _select(self, root: Node) -> list[Node]:
        node, path = root, [root]
        while node.children is not None:
            sqrt_n = math.sqrt(max(node.n, 1))
            best_score, best_a, best_child = -math.inf, None, None
            for a, child in node.children.items():
                q = child.w / child.n if child.n else 0.0
                score = q + self.c_puct * child.prior * sqrt_n / (1 + child.n)
                if score > best_score:
                    best_score, best_a, best_child = score, a, child
            if best_child.state is None:
                best_child.state = node.state.apply(best_a)
            node = best_child
            path.append(node)
        return path

    @staticmethod
    def _expand(node: Node, priors: np.ndarray) -> None:
        node.children = {int(a): Node(float(p)) for a, p in zip(node.state.legal_actions(), priors)}

    @staticmethod
    def _backup(path: list[Node], value: float) -> None:
        # `value` is from the view of the side to move at the leaf. The player who
        # moved into a node is the opponent of the node's side to move, hence -value.
        for node in reversed(path):
            node.n += 1
            node.w -= value
            value = -value


def select_action(visits: np.ndarray, temperature: float, rng: np.random.Generator) -> int:
    """temperature 0 -> most visited move (ties broken randomly); 1 -> sample proportional to visits."""
    if temperature <= 1e-6:
        return int(rng.choice(np.flatnonzero(visits == visits.max())))
    p = visits ** (1.0 / temperature)
    return int(rng.choice(len(p), p=p / p.sum()))


class MCTSAgent:
    def __init__(self, mcts: MCTS, temperature: float = 0.0, temp_plies: int = 0, seed: int | None = None):
        self.mcts = mcts
        self.temperature = temperature
        self.temp_plies = temp_plies  # use `temperature` only during the first plies (opening variety)
        self.rng = np.random.default_rng(seed)
        self.last_value: float | None = None  # root value of the last searched position (for the UI)

    def act(self, states: list) -> list[int]:
        visits, values = self.mcts.search(states)
        self.last_value = values[-1]
        return [
            select_action(v, self.temperature if s.ply < self.temp_plies else 0.0, self.rng)
            for s, v in zip(states, visits)
        ]
