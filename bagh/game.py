"""Rules of বাঘ-ছাগল (Bagh-Chagol).

Board: points joined by straight lines (see bagh/boards.py) - e.g. the square
alquerque pattern from the photo, or the local 13-point hourglass board.

Moves (sides alternate; GameConfig.first says who starts):
  * goat  - step along a line to an adjacent empty point.
  * tiger - step like a goat, OR jump along a straight line over an adjacent
            goat onto the empty point right behind it, capturing that goat.

Game end:
  * tiger wins once it has captured `captures_to_win` goats;
  * a side that has no legal move loses (normally: the goats trap the tiger);
  * after `max_plies` half-moves the game is a draw.

Actions are encoded as a single int `from * P + to` (P = number of points), so the
neural network's policy head has P*P outputs. Most are illegal in any given
position and get masked out.
"""

from __future__ import annotations

import numpy as np

from .boards import Geometry, get_board
from .config import GameConfig

EMPTY, TIGER, GOAT = 0, 1, 2
TIGER_SIDE, GOAT_SIDE = 0, 1
DRAW = -1
SIDE_NAMES = {TIGER_SIDE: "tiger", GOAT_SIDE: "goat", DRAW: "draw"}

NUM_PLANES = 7  # see State.encode


def outcome(winner: int, side: int) -> float:
    """Result of a finished game from `side`'s point of view: +1 win, -1 loss, 0 draw."""
    if winner == DRAW:
        return 0.0
    return 1.0 if winner == side else -1.0


_UNSET = object()


class State:
    """An immutable game position. `apply` returns a new State."""

    __slots__ = ("cfg", "geo", "board", "to_play", "captures", "ply", "_legal", "_winner")

    def __init__(self, cfg: GameConfig, board: np.ndarray, to_play: int, captures: int, ply: int):
        self.cfg = cfg
        self.geo = get_board(cfg.board)
        self.board = board  # int8 array of length P with EMPTY / TIGER / GOAT
        self.to_play = to_play
        self.captures = captures
        self.ply = ply
        self._legal = None
        self._winner = _UNSET

    @classmethod
    def initial(cls, cfg: GameConfig) -> State:
        board = np.zeros(get_board(cfg.board).points, np.int8)
        board[list(cfg.tigers)] = TIGER
        for p in cfg.goats:
            assert board[p] == EMPTY, f"two pieces on point {p}"
            board[p] = GOAT
        if cfg.first not in ("tiger", "goat"):
            raise ValueError(f"GameConfig.first must be 'tiger' or 'goat', not {cfg.first!r}")
        return cls(cfg, board, TIGER_SIDE if cfg.first == "tiger" else GOAT_SIDE, 0, 0)

    # ----- rules -----------------------------------------------------------

    def legal_actions(self) -> np.ndarray:
        if self._legal is None:
            P, b, geo = self.geo.points, self.board.tolist(), self.geo
            actions = []
            if self.to_play == TIGER_SIDE:
                for f in range(P):
                    if b[f] != TIGER:
                        continue
                    actions += [f * P + q for q in geo.steps[f] if b[q] == EMPTY]
                    actions += [f * P + land for over, land in geo.jumps[f] if b[over] == GOAT and b[land] == EMPTY]
            else:
                for f in range(P):
                    if b[f] == GOAT:
                        actions += [f * P + q for q in geo.steps[f] if b[q] == EMPTY]
            self._legal = np.array(actions, dtype=np.int64)
        return self._legal

    def is_capture(self, action: int) -> bool:
        frm, to = divmod(int(action), self.geo.points)
        return self.board[frm] == TIGER and self.geo.is_jump(frm, to)

    def apply(self, action: int) -> State:
        frm, to = divmod(int(action), self.geo.points)
        board = self.board.copy()
        piece = board[frm]
        board[frm], board[to] = EMPTY, piece
        captures = self.captures
        if piece == TIGER and self.geo.is_jump(frm, to):
            board[self.geo.jump_over[(frm, to)]] = EMPTY  # remove the jumped goat
            captures += 1
        return State(self.cfg, board, 1 - self.to_play, captures, self.ply + 1)

    def winner(self) -> int | None:
        """TIGER_SIDE, GOAT_SIDE, DRAW, or None while the game is still going."""
        if self._winner is _UNSET:
            if self.captures >= self.cfg.captures_to_win:
                self._winner = TIGER_SIDE
            elif len(self.legal_actions()) == 0:
                self._winner = 1 - self.to_play  # can't move -> you lose
            elif self.ply >= self.cfg.max_plies:
                self._winner = DRAW
            else:
                self._winner = None
        return self._winner

    def is_terminal(self) -> bool:
        return self.winner() is not None

    # ----- for the neural network --------------------------------------------

    def encode(self) -> np.ndarray:
        """Feature planes of shape (NUM_PLANES, rows, cols), as the network sees the position.

        Points are drawn into a small grid at their board positions; grid cells
        that are not points stay 0 (plane 5 tells the net which cells are real).
        """
        geo = self.geo
        planes = np.zeros((NUM_PLANES, geo.rows * geo.cols), np.float32)
        planes[0, geo.cell_of] = self.board == TIGER
        planes[1, geo.cell_of] = self.board == GOAT
        planes[2] = float(self.to_play)  # 0 = tiger to move, 1 = goat to move
        planes[3] = self.captures / self.cfg.captures_to_win
        planes[4] = self.ply / self.cfg.max_plies  # how close the draw is
        planes = planes.reshape(NUM_PLANES, geo.rows, geo.cols)
        planes[5] = geo.point_mask  # which cells are board points
        planes[6] = geo.degree_plane  # how many lines meet at each point
        return planes

    # ----- hashing / display -----------------------------------------------------

    def key(self) -> tuple:
        return (self.board.tobytes(), self.to_play, self.captures, self.ply)

    @classmethod
    def from_key(cls, cfg: GameConfig, key: tuple) -> State:
        board_bytes, to_play, captures, ply = key
        return cls(cfg, np.frombuffer(board_bytes, np.int8).copy(), to_play, captures, ply)

    def action_str(self, action: int) -> str:
        frm, to = divmod(int(action), self.geo.points)
        return f"{point_name(self.geo, frm)}{'x' if self.is_capture(action) else '-'}{point_name(self.geo, to)}"

    def __str__(self) -> str:
        geo, symbols = self.geo, {EMPTY: ".", TIGER: "T", GOAT: "G"}
        grid = [[" "] * geo.cols for _ in range(geo.rows)]
        for p, (r, c) in enumerate(geo.coords):
            grid[r][c] = symbols[int(self.board[p])]
        side = SIDE_NAMES[self.to_play]
        rows = "\n".join(" ".join(row) for row in grid)
        return rows + f"\n{side} to move, captures={self.captures}, ply={self.ply}"


def point_name(geo: Geometry, p: int) -> str:
    return geo.labels[p]
