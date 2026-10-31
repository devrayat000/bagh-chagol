"""Applying a board symmetry to a training batch (data augmentation).

If mirroring or rotating the board maps the rules onto themselves, a transformed
position is exactly as good as the original and its best move is the transformed
best move - free extra data. Each game lists its symmetries in its GameSpec, as
two "gather" index arrays:
  cell_idx[i]   = which old grid cell lands on new grid cell i   (for input planes)
  action_idx[a] = which old action becomes new action a          (for policies)
so `new = old[..., idx]` transforms both.
"""

import numpy as np
import torch


def transform_batch(planes: torch.Tensor, policy: torch.Tensor, sym: tuple[np.ndarray, np.ndarray]):
    """Apply one symmetry to a batch: planes (B, C, rows, cols), policy (B, num_actions)."""
    cell_idx, action_idx = sym
    device = planes.device
    ci = torch.as_tensor(cell_idx, device=device)
    ai = torch.as_tensor(action_idx, device=device)
    new_planes = planes.flatten(2)[..., ci].view_as(planes)
    return new_planes, policy[:, ai]
