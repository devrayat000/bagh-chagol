"""Scripted four-in-a-row opponents, used to measure the learning agent.

  FourRowGreedyAgent - one move of look-ahead: win, else block, else don't hand over a win.
  LookaheadAgent     - classic alpha-beta search with a hand-written evaluation.
                       Depth 4 is a decent club-player-ish yardstick; the net should beat it.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from core.spec import DRAW

from .config import FourRowConfig
from .game import State


def _center_order(legal, cols: int) -> list[int]:
    mid = (cols - 1) / 2
    return sorted((int(a) for a in legal), key=lambda a: abs(a - mid))


class FourRowGreedyAgent:
    def __init__(self, seed: int | None = None):
        self.rng = np.random.default_rng(seed)

    def act(self, states: list[State]) -> list[int]:
        return [self._act(s) for s in states]

    def _act(self, s: State) -> int:
        legal = s.legal_actions()
        children = {int(a): s.apply(a) for a in legal}
        winning = [a for a, c in children.items() if c.winner() == s.to_play]
        if winning:
            return int(self.rng.choice(winning))

        # Moves the opponent would win with if it were their turn now: we must take that column.
        opp = s.to_play ^ 1
        flipped = State(s.cfg, s.grid, s.heights, opp, s.ply)
        blocks = [int(a) for a in legal if flipped.apply(a).winner() == opp]
        if blocks:
            return int(self.rng.choice(blocks))

        safe = [a for a, c in children.items() if not any(c.apply(b).winner() == opp for b in c.legal_actions())]
        pool = safe or list(children)
        # Prefer central columns (they take part in more lines), ties broken randomly.
        mid = (s.cfg.cols - 1) / 2
        best = min(abs(a - mid) for a in pool)
        return int(self.rng.choice([a for a in pool if abs(a - mid) == best]))


@lru_cache(maxsize=None)
def _windows(rows: int, cols: int, connect: int) -> np.ndarray:
    """Every line of `connect` cells, as flat indices: shape (num_windows, connect)."""
    out = []
    for r in range(rows):
        for c in range(cols):
            for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
                cells = [(r + i * dr, c + i * dc) for i in range(connect)]
                if all(0 <= rr < rows and 0 <= cc < cols for rr, cc in cells):
                    out.append([rr * cols + cc for rr, cc in cells])
    return np.array(out)


WIN_SCORE = 1_000_000


def heuristic(s: State) -> float:
    """Score for the side to move: open lines with 2 or 3 of our pieces are good, the opponent's are bad."""
    cfg: FourRowConfig = s.cfg
    flat = s.grid.ravel()[_windows(cfg.rows, cfg.cols, cfg.connect)]
    own = (flat == s.to_play + 1).sum(1)
    opp = (flat == 2 - s.to_play).sum(1)
    k = cfg.connect
    score = 0.0
    score += 5 * np.sum((own == k - 1) & (opp == 0)) + 2 * np.sum((own == k - 2) & (opp == 0))
    score -= 5 * np.sum((opp == k - 1) & (own == 0)) + 2 * np.sum((opp == k - 2) & (own == 0))
    center = s.grid[:, cfg.cols // 2]
    score += 3 * (np.sum(center == s.to_play + 1) - np.sum(center == 2 - s.to_play))
    return float(score)


class LookaheadAgent:
    def __init__(self, depth: int = 4, seed: int | None = None):
        self.depth = depth
        self.rng = np.random.default_rng(seed)

    def act(self, states: list[State]) -> list[int]:
        return [self._act(s) for s in states]

    def _act(self, s: State) -> int:
        scores = {}
        for a in _center_order(s.legal_actions(), s.cfg.cols):
            scores[a] = -self._negamax(s.apply(a), self.depth - 1, -WIN_SCORE * 2, WIN_SCORE * 2)
        best = max(scores.values())
        return int(self.rng.choice([a for a, v in scores.items() if v == best]))

    def _negamax(self, s: State, depth: int, alpha: float, beta: float) -> float:
        w = s.winner()
        if w is not None:
            # The previous player made a line -> loss for us. Prefer slow losses / fast wins.
            return 0.0 if w == DRAW else -(WIN_SCORE - s.ply)
        if depth == 0:
            return heuristic(s)
        value = -WIN_SCORE * 2
        for a in _center_order(s.legal_actions(), s.cfg.cols):
            value = max(value, -self._negamax(s.apply(a), depth - 1, -beta, -alpha))
            alpha = max(alpha, value)
            if alpha >= beta:
                break
        return value
