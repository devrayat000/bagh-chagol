"""Rules of four-in-a-row: a vertical board (7 columns x 6 rows by default).

Players take turns dropping a piece into a column; it falls to the lowest empty
cell. Whoever first gets `connect` (4) pieces in a line - horizontal, vertical
or diagonal - wins. A full board with no line is a draw.

Action = column index (0..cols-1), so the policy head has only `cols` outputs.
Row 0 is the TOP row of the grid (as printed), pieces stack up from row rows-1.

With perfect play the first player wins on 7x6, so a strong agent should win
most games it starts and hold out as long as possible as the second player.
"""

from __future__ import annotations

import numpy as np

from core.spec import DRAW

from .config import FourRowConfig

EMPTY = 0  # cells hold 0 (empty), 1 (side 0's piece) or 2 (side 1's piece)
NUM_PLANES = 3  # see State.encode
SIDE_NAMES = ("red", "yellow")


_UNSET = object()
_DIRECTIONS = ((0, 1), (1, 0), (1, 1), (1, -1))  # horizontal, vertical, two diagonals


class State:
    """An immutable game position. `apply` returns a new State."""

    __slots__ = ("cfg", "grid", "heights", "to_play", "ply", "last", "_legal", "_winner")

    def __init__(self, cfg: FourRowConfig, grid: np.ndarray, heights: tuple[int, ...], to_play: int, ply: int,
                 last: tuple[int, int] | None = None):  # fmt: skip
        self.cfg = cfg
        self.grid = grid  # int8 (rows, cols)
        self.heights = heights  # pieces in each column
        self.to_play = to_play
        self.ply = ply
        self.last = last  # (row, col) of the last piece dropped, for a fast win check
        self._legal = None
        self._winner = _UNSET

    @classmethod
    def initial(cls, cfg: FourRowConfig) -> State:
        return cls(cfg, np.zeros((cfg.rows, cfg.cols), np.int8), (0,) * cfg.cols, 0, 0)

    # ----- rules -----------------------------------------------------------

    def legal_actions(self) -> np.ndarray:
        if self._legal is None:
            self._legal = np.array([c for c, h in enumerate(self.heights) if h < self.cfg.rows], dtype=np.int64)
        return self._legal

    def apply(self, action: int) -> State:
        col = int(action)
        h = self.heights[col]
        if h >= self.cfg.rows:
            raise ValueError(f"column {col} is full")
        row = self.cfg.rows - 1 - h
        grid = self.grid.copy()
        grid[row, col] = self.to_play + 1
        heights = self.heights[:col] + (h + 1,) + self.heights[col + 1 :]
        return State(self.cfg, grid, heights, 1 - self.to_play, self.ply + 1, (row, col))

    def winner(self) -> int | None:
        """0, 1, DRAW, or None while the game is still going."""
        if self._winner is _UNSET:
            if self.last is not None and self._makes_line(*self.last):
                self._winner = 1 - self.to_play  # the player who just moved
            elif self.ply >= self.cfg.rows * self.cfg.cols:
                self._winner = DRAW
            else:
                self._winner = None
        return self._winner

    def _makes_line(self, row: int, col: int) -> bool:
        return bool(self.winning_cells(row, col))

    def winning_cells(self, row: int | None = None, col: int | None = None) -> list[tuple[int, int]]:
        """The (row, col) cells of every line through (row, col) - default: the last piece - that is long enough."""
        if row is None:
            if self.last is None:
                return []
            row, col = self.last
        g, rows, cols, piece = self.grid, self.cfg.rows, self.cfg.cols, self.grid[row, col]
        cells = []
        for dr, dc in _DIRECTIONS:
            line = [(row, col)]
            for sign in (1, -1):
                r, c = row + sign * dr, col + sign * dc
                while 0 <= r < rows and 0 <= c < cols and g[r, c] == piece:
                    line.append((r, c))
                    r, c = r + sign * dr, c + sign * dc
            if len(line) >= self.cfg.connect:
                cells += line
        return cells

    def is_terminal(self) -> bool:
        return self.winner() is not None

    # ----- for the neural network --------------------------------------------

    @property
    def num_actions(self) -> int:
        return self.cfg.cols

    def encode(self) -> np.ndarray:
        """Feature planes of shape (3, rows, cols): own pieces, opponent pieces, side to move.

        "Own/opponent" instead of "red/yellow" means the same pattern looks the same
        to the net whichever side it plays; plane 2 still says who moved first,
        because that matters for who is winning.
        """
        planes = np.zeros((NUM_PLANES, self.cfg.rows, self.cfg.cols), np.float32)
        planes[0] = self.grid == self.to_play + 1
        planes[1] = self.grid == 2 - self.to_play
        planes[2] = float(self.to_play)
        return planes

    # ----- display -----------------------------------------------------------

    def action_str(self, action: int) -> str:
        return str(int(action) + 1)

    def __str__(self) -> str:
        symbols = {EMPTY: ".", 1: "X", 2: "O"}
        rows = "\n".join(" ".join(symbols[int(v)] for v in row) for row in self.grid)
        numbers = " ".join(str(c + 1) for c in range(self.cfg.cols))
        return f"{rows}\n{numbers}\n{SIDE_NAMES[self.to_play]} ({'XO'[self.to_play]}) to move, ply={self.ply}"


def symmetries(cfg: FourRowConfig) -> list[tuple[np.ndarray, np.ndarray]]:
    """Identity and left-right mirror, in the (cell_idx, action_idx) format of core/symmetry.py.

    Gravity pulls down, so up-down flips and rotations are NOT symmetries.
    """
    grid = np.arange(cfg.rows * cfg.cols).reshape(cfg.rows, cfg.cols)
    identity = (grid.ravel().copy(), np.arange(cfg.cols))
    mirror = (np.fliplr(grid).ravel().copy(), np.arange(cfg.cols)[::-1].copy())
    return [identity, mirror]
