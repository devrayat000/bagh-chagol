"""Board symmetries for data augmentation.

If rotating or mirroring the board maps every point onto a point and every line
onto a line, then a transformed position is exactly as good as the original
and its best move is the transformed best move. So every training sample can
be shown to the net in all of these orientations: free extra data.

The square alquerque board has 8 such symmetries (4 rotations x mirror). The
hourglass board has 4 (identity, left-right mirror, top-bottom mirror, 180°
rotation); rotating it by 90° would not map lines to lines.

Each symmetry is stored as two "gather" index arrays:
  cell_idx[i]   = which old grid cell lands on new grid cell i   (for input planes)
  action_idx[a] = which old action becomes new action a          (for policies)
so `new = old[..., idx]` transforms both (core/symmetry.py applies them).
"""

from functools import lru_cache

import numpy as np

from .boards import get_board


def _grid_transforms(rows: int, cols: int):
    grid = np.arange(rows * cols).reshape(rows, cols)
    for k in range(4):
        for mirror in (False, True):
            g = np.rot90(grid, k)
            if mirror:
                g = np.fliplr(g)
            if g.shape == grid.shape:
                yield g.ravel().copy()


@lru_cache(maxsize=None)
def symmetries(board: str) -> list[tuple[np.ndarray, np.ndarray]]:
    geo = get_board(board)
    point_at_cell = np.full(geo.rows * geo.cols, -1)
    point_at_cell[geo.cell_of] = np.arange(geo.points)
    edges = set(geo.edges)
    jumps = set(geo.jump_over.items())

    result = []
    for cell_idx in _grid_transforms(geo.rows, geo.cols):
        old = point_at_cell[cell_idx[geo.cell_of]]  # old[i] = old point that moves onto point i
        if (old < 0).any():
            continue  # some point would land on an empty cell
        if {(min(old[a], old[b]), max(old[a], old[b])) for a, b in edges} != edges:
            continue  # lines are not preserved
        new_of_old = np.argsort(old)
        if {((new_of_old[f], new_of_old[t]), new_of_old[o]) for (f, t), o in jumps} != jumps:
            continue
        action_idx = (old[:, None] * geo.points + old[None, :]).ravel()
        result.append((cell_idx, action_idx))
    return result

