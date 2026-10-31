"""Scripted bagh-chal opponents, used to sanity-check the learning agent.

An agent is anything with `act(states: list[State]) -> list[int]`.
RandomAgent works for every game and lives in core/baselines.py.
"""

from __future__ import annotations

import numpy as np

from .game import GOAT_SIDE, TIGER_SIDE, State


class GreedyAgent:
    """One move of look-ahead.

    tiger: wins immediately if it can, otherwise captures if it can, otherwise random.
    goat : traps the tiger if it can, otherwise avoids moves that allow a capture next turn.
    """

    def __init__(self, seed: int | None = None):
        self.rng = np.random.default_rng(seed)

    def act(self, states: list[State]) -> list[int]:
        return [self._act(s) for s in states]

    def _act(self, s: State) -> int:
        legal = s.legal_actions()
        if s.to_play == TIGER_SIDE:
            captures = [a for a in legal if s.is_capture(a)]
            return int(self.rng.choice(captures if captures else legal))

        winning, safe = [], []
        for a in legal:
            nxt = s.apply(a)
            if nxt.winner() == GOAT_SIDE:
                winning.append(a)
            elif not any(nxt.is_capture(b) for b in nxt.legal_actions()):
                safe.append(a)
        return int(self.rng.choice(winning or safe or list(legal)))
