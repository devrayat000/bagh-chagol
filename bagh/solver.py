"""Exact solver by retrograde analysis (works backwards from finished games).

For small games we can compute perfect play for every reachable position. That
is our ground truth for checking the RL agent: "does the network pick a move a
perfect player would?"

How it works:
  1. Explore every position reachable from the start (board + side to move;
     the move counter is ignored here).
  2. Positions where the game is over are solved: "side to move lost/won in 0".
  3. Work backwards, in order of distance:
       - if ANY move leads to a position the opponent loses -> I win (in d+1);
       - if ALL moves lead to positions the opponent wins  -> I lose (in d+1).
     Whatever is never solved is a draw even with unlimited moves.
This gives a "distance to the end" (dtm) for every won/lost position. With the
draw-after-max_plies rule, a position with r plies left is won only if
dtm <= r, otherwise it is a draw.

Compared with plain recursive search, every position is solved exactly once no
matter at which move number it occurs, so boards with ~10^5-10^6 positions
(3x3, the 13-point hourglass) take seconds.
"""

from __future__ import annotations

from collections import deque
from math import comb

import numpy as np

from .boards import get_board
from .config import GameConfig
from .game import SIDE_NAMES, State, outcome

MAX_STATES = 3_000_000


def estimate_states(cfg: GameConfig) -> int:
    """Upper bound on the number of positions: tiger placements x goat placements x side to move."""
    points, tigers, goats = get_board(cfg.board).points, len(cfg.tigers), len(cfg.goats)
    min_goats = max(0, goats - cfg.captures_to_win)
    goat_layouts = sum(comb(points - tigers, g) for g in range(min_goats, goats + 1))
    return comb(points, tigers) * goat_layouts * 2


class Solver:
    def __init__(self, cfg: GameConfig):
        if estimate_states(cfg) > 10 * MAX_STATES:
            raise ValueError(f"game has up to {estimate_states(cfg):,} positions; too big to solve exactly")
        self.cfg = cfg
        self.index: dict[tuple, int] = {}
        self.states: list[State] = []
        children: list[list[int]] = []

        def add(s: State) -> int:
            key = (s.board.tobytes(), s.to_play)
            i = self.index.get(key)
            if i is None:
                if len(self.states) >= MAX_STATES:
                    raise ValueError(f"game has more than {MAX_STATES:,} positions; too big to solve exactly")
                i = self.index[key] = len(self.states)
                self.states.append(State(cfg, s.board, s.to_play, s.captures, 0))  # ply 0: no draw rule
                children.append(None)
                frontier.append(i)
            return i

        # 1. Forward: discover every reachable position and its successors.
        frontier = deque()
        add(State.initial(cfg))
        while frontier:
            i = frontier.popleft()
            s = self.states[i]
            children[i] = [] if s.winner() is not None else sorted({add(s.apply(a)) for a in s.legal_actions()})

        # 2-3. Backward: solve from finished games outwards.
        n = len(self.states)
        parents: list[list[int]] = [[] for _ in range(n)]
        for i, ch in enumerate(children):
            for c in ch:
                parents[c].append(i)
        self.result = np.zeros(n, np.int8)  # +1 side to move wins, -1 loses, 0 draw
        self.dtm = np.full(n, -1, np.int32)  # plies until the game ends with best play
        unresolved = np.array([len(ch) for ch in children])
        queue = deque()
        for i, s in enumerate(self.states):
            w = s.winner()
            if w is not None:
                self.result[i], self.dtm[i] = int(outcome(w, s.to_play)), 0
                queue.append(i)
        while queue:
            i = queue.popleft()
            for p in parents[i]:
                if self.dtm[p] >= 0:
                    continue
                if self.result[i] == -1:  # move into a lost position for the opponent: p wins
                    self.result[p], self.dtm[p] = 1, self.dtm[i] + 1
                    queue.append(p)
                else:
                    unresolved[p] -= 1
                    if unresolved[p] == 0:  # every move lets the opponent win: p loses
                        self.result[p], self.dtm[p] = -1, self.dtm[i] + 1
                        queue.append(p)

    def value(self, state: State) -> int:
        """Perfect-play result for the side to move (+1 win, 0 draw, -1 loss), honouring the move limit."""
        i = self.index[(state.board.tobytes(), state.to_play)]
        r = self.cfg.max_plies - state.ply
        return int(self.result[i]) if 0 <= self.dtm[i] <= r else 0

    def distance(self, state: State) -> int | None:
        """Plies until the game ends with best play, or None if it is a draw."""
        i = self.index[(state.board.tobytes(), state.to_play)]
        return int(self.dtm[i]) if self.dtm[i] >= 0 else None

    def action_values(self, state: State) -> dict[int, int]:
        return {int(a): -self.value(state.apply(a)) for a in state.legal_actions()}

    def best_actions(self, state: State) -> list[int]:
        """Optimal moves. Among winning moves, prefer the fastest win; when losing, the slowest loss."""
        values = self.action_values(state)
        best = max(values.values())
        moves = [a for a, v in values.items() if v == best]
        if best != 0:
            dist = {a: self.distance(state.apply(a)) for a in moves}
            target = min(dist.values()) if best > 0 else max(dist.values())
            moves = [a for a in moves if dist[a] == target]
        return moves

    def decisive_positions(self, limit: int = 1000, seed: int = 0) -> list[tuple[State, set[int]]]:
        """Reachable positions where the choice of move matters, with the set of moves that keep the best result.

        Used as a test set: an agent that picks a move from the set never throws away a win or a draw.
        Each position gets a random move number of the right parity (the first mover moves on even plies).
        """
        rng = np.random.default_rng(seed)
        order = rng.permutation(len(self.states))
        result = []
        for i in order:
            base = self.states[i]
            if base.winner() is not None:
                continue
            first = State.initial(self.cfg).to_play
            ply = 2 * int(rng.integers(0, max(1, self.cfg.max_plies // 4))) + int(base.to_play != first)
            s = State(self.cfg, base.board, base.to_play, base.captures, ply)
            values = self.action_values(s)
            if len(set(values.values())) > 1:
                best = max(values.values())
                result.append((s, {a for a, v in values.items() if v == best}))
                if len(result) >= limit:
                    break
        return result


def can_solve(cfg: GameConfig) -> bool:
    try:
        get_solver(cfg)
        return True
    except ValueError:
        return False


_SOLVERS: dict[GameConfig, Solver] = {}


def get_solver(cfg: GameConfig) -> Solver:
    if cfg not in _SOLVERS:
        _SOLVERS[cfg] = Solver(cfg)
    return _SOLVERS[cfg]


class SolverAgent:
    """A perfect player. Picks randomly among optimal moves."""

    def __init__(self, cfg: GameConfig, seed: int | None = None):
        self.solver = get_solver(cfg)
        self.rng = np.random.default_rng(seed)
        self.last_value: float | None = None

    def act(self, states: list[State]) -> list[int]:
        actions = []
        for s in states:
            self.last_value = float(self.solver.value(s))
            actions.append(int(self.rng.choice(self.solver.best_actions(s))))
        return actions


def describe(cfg: GameConfig) -> str:
    solver = get_solver(cfg)
    start = State.initial(cfg)
    v = solver.value(start)
    mover, other = SIDE_NAMES[start.to_play], SIDE_NAMES[1 - start.to_play]
    verdict = {1: f"{mover} wins", 0: "draw", -1: f"{other} wins"}[v]
    d = solver.distance(start)
    if v != 0:
        verdict += f" in {d} plies"
    elif d is not None:
        verdict += f" (only because of the {cfg.max_plies}-ply limit: without it, it ends in {d} plies)"
    lines = [str(start), "", f"Perfect play result: {verdict}", f"Reachable positions: {len(solver.states):,}"]
    for a, val in sorted(solver.action_values(start).items(), key=lambda kv: -kv[1]):
        lines.append(f"  first move {start.action_str(a):8s} -> {({1: 'win', 0: 'draw', -1: 'loss'})[val]}")
    return "\n".join(lines)
