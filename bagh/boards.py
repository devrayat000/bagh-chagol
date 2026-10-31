"""Board shapes.

A board is a set of points placed on a small grid, plus the straight lines
drawn through them. Everything else is derived from the lines:
  * a piece can STEP between neighbouring points on a line;
  * a tiger can JUMP from one point over the next onto the one after,
    i.e. along any three consecutive points of a line.

The grid position of each point is used for two things: drawing the board, and
laying out the network's input "images" so convolutions see real neighbours
next to each other.

To add your own board, write a function like `hourglass()` and register it in BOARDS.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np


class Geometry:
    def __init__(self, name: str, rows: int, cols: int, coords: list[tuple[int, int]],
                 lines: list[list[int]], labels: list[str], shading: list[list[int]],
                 grid_labels: bool = False):  # fmt: skip
        assert len(set(coords)) == len(coords), "two points share a grid cell"
        self.name, self.rows, self.cols = name, rows, cols
        self.coords = tuple(coords)  # (row, col) of every point
        self.points = len(coords)
        self.num_actions = self.points * self.points  # action = from * points + to
        self.labels = tuple(labels)  # how points are named in the UI / logs
        self.shading = shading  # polygons (lists of points) to fill when drawing
        self.grid_labels = grid_labels  # draw a1..e5 axis labels instead of point numbers
        self.lines = [tuple(line) for line in lines]

        steps = [set() for _ in range(self.points)]
        self.jump_over: dict[tuple[int, int], int] = {}  # (from, to) -> jumped-over point
        for line in self.lines:
            for a, b in zip(line, line[1:]):
                steps[a].add(b)
                steps[b].add(a)
            for a, b, c in zip(line, line[1:], line[2:]):
                self.jump_over[(a, c)] = b
                self.jump_over[(c, a)] = b
        jumps = [[] for _ in range(self.points)]
        for (a, c), b in self.jump_over.items():
            jumps[a].append((b, c))

        self.steps: tuple[tuple[int, ...], ...] = tuple(tuple(sorted(s)) for s in steps)
        self.jumps: tuple[tuple[tuple[int, int], ...], ...] = tuple(tuple(sorted(j)) for j in jumps)
        self.edges = sorted({(min(a, b), max(a, b)) for a in range(self.points) for b in steps[a]})

        # Where each point lives in the flattened grid, plus two constant input planes.
        self.cell_of = np.array([r * cols + c for r, c in coords], dtype=np.int64)
        point_mask = np.zeros(rows * cols, np.float32)
        point_mask[self.cell_of] = 1.0
        degree = np.zeros(rows * cols, np.float32)
        degree[self.cell_of] = [len(s) for s in steps]
        self.point_mask = point_mask.reshape(rows, cols)  # 1 where a point exists
        self.degree_plane = (degree / degree.max()).reshape(rows, cols)  # how connected each point is

    def rc(self, p: int) -> tuple[int, int]:
        return self.coords[p]

    def is_jump(self, frm: int, to: int) -> bool:
        return (frm, to) in self.jump_over


def alquerque(n: int) -> Geometry:
    """Square N x N grid; points with (row + col) even also have diagonals (the photo's board)."""
    if n < 3 or n % 2 == 0:
        raise ValueError("alquerque board size must be odd and >= 3")

    def idx(r, c):
        return r * n + c

    lines = [[idx(r, c) for c in range(n)] for r in range(n)]
    lines += [[idx(r, c) for r in range(n)] for c in range(n)]
    for d in range(-(n - 1), n):  # "\" diagonals: r - c = d; points on them have even r + c iff d is even
        cells = [idx(r, r - d) for r in range(n) if 0 <= r - d < n]
        if len(cells) >= 2 and d % 2 == 0:
            lines.append(cells)
    for s in range(2 * n - 1):  # "/" diagonals: r + c = s
        cells = [idx(r, s - r) for r in range(n) if 0 <= s - r < n]
        if len(cells) >= 2 and s % 2 == 0:
            lines.append(cells)
    coords = [(r, c) for r in range(n) for c in range(n)]
    labels = [f"{'abcdefghijklmnopqrstuvwxyz'[c]}{n - r}" for r, c in coords]  # a1 = bottom-left
    corners = [idx(0, 0), idx(0, n - 1), idx(n - 1, n - 1), idx(n - 1, 0)]
    return Geometry(f"alquerque{n}", n, n, coords, lines, labels, [corners], grid_labels=True)


def hourglass() -> Geometry:
    """The local 13-point board: two triangles meeting at point 7.

         1 ---- 2 ---- 3
           4 -- 5 -- 6
                7
           8 -- 9 -- 10
        11 --- 12 --- 13
    lines: rows, the vertical 2-5-7-9-12 and the diagonals 1-4-7-10-13, 3-6-7-8-11.
    """
    coords = [(0, 0), (0, 2), (0, 4), (1, 1), (1, 2), (1, 3), (2, 2), (3, 1), (3, 2), (3, 3), (4, 0), (4, 2), (4, 4)]
    lines_1based = [
        [1, 2, 3], [4, 5, 6], [8, 9, 10], [11, 12, 13],
        [2, 5, 7, 9, 12], [1, 4, 7, 10, 13], [3, 6, 7, 8, 11],
    ]  # fmt: skip
    lines = [[p - 1 for p in line] for line in lines_1based]
    labels = [str(i + 1) for i in range(len(coords))]
    shading = [[0, 2, 6], [10, 12, 6]]  # the two triangles
    return Geometry("hourglass", 5, 5, coords, lines, labels, shading)


BOARDS = {"alquerque3": lambda: alquerque(3), "alquerque5": lambda: alquerque(5), "hourglass": hourglass}


@lru_cache(maxsize=None)
def get_board(name: str) -> Geometry:
    if name not in BOARDS:
        raise ValueError(f"unknown board {name!r}; known: {', '.join(BOARDS)}")
    return BOARDS[name]()
