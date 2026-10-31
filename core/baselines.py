"""Game-independent baseline opponents.

An agent is anything with `act(states: list[State]) -> list[int]`.
"""

from __future__ import annotations

import numpy as np


class RandomAgent:
    def __init__(self, seed: int | None = None):
        self.rng = np.random.default_rng(seed)

    def act(self, states: list) -> list[int]:
        return [int(self.rng.choice(s.legal_actions())) for s in states]
