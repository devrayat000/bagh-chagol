"""What the shared training code needs to know about a game.

MCTS and self-play only talk to State objects:
    legal_actions() / apply(a) / winner() / encode() / to_play / ply / num_actions
Everything else - the network's input shape, board symmetries, baseline
opponents, an exact solver - comes from a GameSpec. Every game config
(bagh.config.GameConfig, fourrow.config.FourRowConfig, ...) has a `spec()`
method that builds one.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Callable

import numpy as np

DRAW = -1  # winner() of a drawn game; sides are 0 (moves first by default) and 1


def outcome(winner: int, side: int) -> float:
    """Result of a finished game from `side`'s point of view: +1 win, -1 loss, 0 draw."""
    if winner == DRAW:
        return 0.0
    return 1.0 if winner == side else -1.0


@dataclass(frozen=True)
class GameSpec:
    num_planes: int
    rows: int
    cols: int
    num_actions: int
    side_names: tuple[str, str]  # side 0, side 1
    initial: Callable[[], object]  # () -> starting State
    symmetries: list[tuple[np.ndarray, np.ndarray]]  # (cell_idx, action_idx) pairs, see core/symmetry.py
    make_greedy: Callable[[int], object]  # seed -> one-move-lookahead baseline agent
    perfect_positions: Callable[[int, int], list] | None = None  # (limit, seed) -> solver test set, if solvable
    extra_opponents: Callable[[], dict] = field(default=dict)  # name -> agent, for `eval` (solver, alpha-beta...)
    board: str | None = None  # bagh board name (stored in checkpoints for export_web.py / bagh/play.py)

    @property
    def letters(self) -> str:
        """One letter per side, for compact result strings like T3/G1/D0."""
        return self.side_names[0][0].upper() + self.side_names[1][0].upper()


@lru_cache(maxsize=None)
def spec_of(cfg) -> GameSpec:
    return cfg.spec()
