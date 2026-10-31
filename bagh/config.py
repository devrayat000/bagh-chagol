"""Bagh-chal game presets.

A preset bundles *what game we play* (GameConfig) with *how hard we train*
(core.config.TrainConfig). Start with `tiny`, which is small enough to solve exactly, then
move on to `hourglass` (the local 13-point board), `small` and `full`.

Pieces are placed by point index (see bagh/boards.py). For square alquerque
boards `_rc(n, ...)` converts (row, col) pairs; for the hourglass board `_pts`
converts the 1-based point numbers from the drawing.
"""

from dataclasses import dataclass

from core.config import Preset, TrainConfig, with_overrides


@dataclass(frozen=True)
class GameConfig:
    name: str
    board: str  # a key of bagh.boards.BOARDS
    tigers: tuple[int, ...]  # starting point of each tiger
    goats: tuple[int, ...]  # starting point of each goat
    captures_to_win: int  # tiger wins after this many captures
    max_plies: int  # game is a draw after this many half-moves
    first: str = "tiger"  # who moves first: "tiger" or "goat"

    def spec(self):
        """What the shared training code (core/) needs to know about this game."""
        from core.spec import GameSpec

        from .baselines import GreedyAgent
        from .boards import get_board
        from .game import NUM_PLANES, State
        from .solver import SolverAgent, can_solve, get_solver
        from .symmetry import symmetries

        geo = get_board(self.board)
        solvable = can_solve(self)
        return GameSpec(
            num_planes=NUM_PLANES, rows=geo.rows, cols=geo.cols, num_actions=geo.num_actions,
            side_names=("tiger", "goat"), initial=lambda: State.initial(self), symmetries=symmetries(self.board),
            make_greedy=GreedyAgent,
            perfect_positions=(lambda limit, seed: get_solver(self).decisive_positions(limit=limit, seed=seed))
            if solvable else None,
            extra_opponents=(lambda: {"perfect": SolverAgent(self, seed=3)}) if solvable else dict,
            board=self.board,
        )  # fmt: skip


def _rc(n: int, cells) -> tuple[int, ...]:
    return tuple(r * n + c for r, c in cells)


def _row(r: int, cols) -> list[tuple[int, int]]:
    return [(r, c) for c in cols]


def _pts(*numbers: int) -> tuple[int, ...]:
    return tuple(p - 1 for p in numbers)


PRESETS: dict[str, Preset] = {
    # 3x3, 1 tiger vs 3 goats. Tiny enough that bagh/solver.py can compute
    # perfect play, so we can measure exactly how good the agent is.
    "tiny": Preset(
        GameConfig(
            name="tiny",
            board="alquerque3",
            tigers=_rc(3, [(0, 1)]),
            goats=_rc(3, _row(2, range(3))),
            captures_to_win=1,
            max_plies=30,
        ),
        TrainConfig(iterations=15, sims=60, train_steps=150, temp_plies=6, channels=32, blocks=2),
    ),
    # The local 13-point hourglass board: 1 tiger on 9 vs 7 goats on 1-7.
    "hourglass": Preset(
        GameConfig(
            name="hourglass",
            board="hourglass",
            tigers=_pts(9),
            goats=_pts(1, 2, 3, 4, 5, 6, 7),
            captures_to_win=3,
            max_plies=60,
            first="goat",
        ),
        TrainConfig(iterations=25, sims=100, train_steps=200, temp_plies=8, channels=64, blocks=3),
    ),
    # 5x5, 1 tiger vs 8 goats.
    "small": Preset(
        GameConfig(
            name="small",
            board="alquerque5",
            tigers=_rc(5, [(0, 2)]),
            goats=_rc(5, _row(4, range(5)) + _row(3, (1, 2, 3))),
            captures_to_win=3,
            max_plies=100,
        ),
        TrainConfig(iterations=60, sims=200, train_steps=300, temp_plies=12, eval_every=5),
    ),
    # 5x5, 4 tigers in the corners vs 12 goats (similar to the photo).
    "full": Preset(
        GameConfig(
            name="full",
            board="alquerque5",
            tigers=_rc(5, [(0, 0), (0, 4), (4, 0), (4, 4)]),
            goats=_rc(5, _row(1, range(5)) + _row(3, range(5)) + [(2, 0), (2, 4)]),
            captures_to_win=4,
            max_plies=150,
        ),
        TrainConfig(iterations=100, sims=200, train_steps=400, temp_plies=16, channels=96, blocks=6, eval_every=5),
    ),
}


def get_preset(name: str, **train_overrides) -> Preset:
    if name not in PRESETS:
        raise SystemExit(f"unknown preset {name!r}; choose from {', '.join(PRESETS)}")
    return with_overrides(PRESETS[name], **train_overrides)
