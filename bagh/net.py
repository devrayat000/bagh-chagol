"""The policy/value network: a small residual CNN.

Input : feature planes (B, NUM_PLANES, rows, cols) from State.encode()
Output: policy logits (B, P*P) - one score per (from, to) move, P = number of points
        value         (B,)     - expected result in [-1, 1] for the side to move

One network plays both sides; plane 2 tells it whose turn it is.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from .boards import get_board
from .config import GameConfig, TrainConfig, get_preset
from .game import NUM_PLANES, State


class ResBlock(nn.Module):
    def __init__(self, ch: int):
        super().__init__()
        self.conv1 = nn.Conv2d(ch, ch, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(ch)
        self.conv2 = nn.Conv2d(ch, ch, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(ch)

    def forward(self, x):
        y = F.relu(self.bn1(self.conv1(x)))
        y = self.bn2(self.conv2(y))
        return F.relu(x + y)


class BaghNet(nn.Module):
    def __init__(self, board: str, channels: int = 64, blocks: int = 4):
        super().__init__()
        geo = get_board(board)
        cells, points = geo.rows * geo.cols, geo.points
        self.board, self.channels, self.blocks = board, channels, blocks
        self.stem = nn.Sequential(
            nn.Conv2d(NUM_PLANES, channels, 3, padding=1, bias=False), nn.BatchNorm2d(channels), nn.ReLU()
        )
        self.tower = nn.Sequential(*[ResBlock(channels) for _ in range(blocks)])
        self.policy_head = nn.Sequential(
            nn.Conv2d(channels, 4, 1, bias=False), nn.BatchNorm2d(4), nn.ReLU(), nn.Flatten(),
            nn.Linear(4 * cells, points * points),
        )  # fmt: skip
        self.value_head = nn.Sequential(
            nn.Conv2d(channels, 2, 1, bias=False), nn.BatchNorm2d(2), nn.ReLU(), nn.Flatten(),
            nn.Linear(2 * cells, 64), nn.ReLU(), nn.Linear(64, 1), nn.Tanh(),
        )  # fmt: skip

    def forward(self, x):
        h = self.tower(self.stem(x))
        return self.policy_head(h), self.value_head(h).squeeze(-1)


def build_net(game: GameConfig, train: TrainConfig) -> BaghNet:
    return BaghNet(game.board, train.channels, train.blocks)


class NetEvaluator:
    """Callable used by MCTS: list of States -> (priors over each state's legal moves, values)."""

    def __init__(self, net: BaghNet, device: torch.device, cuda_graphs: bool = True):
        self.net = net.to(device).eval()
        self.device = device
        self.use_graphs = cuda_graphs and device.type == "cuda"
        self.graphs: dict[int, tuple] = {}

    @torch.inference_mode()
    def __call__(self, states: list[State]) -> tuple[list[np.ndarray], np.ndarray]:
        x = torch.from_numpy(np.stack([s.encode() for s in states])).to(self.device, non_blocking=True)
        logits, values = self._forward(x)
        logits = logits.float().cpu().numpy()
        priors = []
        for s, row in zip(states, logits):
            legal_logits = row[s.legal_actions()]  # mask: keep only legal moves
            p = np.exp(legal_logits - legal_logits.max())
            priors.append(p / p.sum())
        return priors, values.float().cpu().numpy()

    def _forward(self, x: torch.Tensor):
        """Run the net. On CUDA, replay a recorded CUDA graph instead of launching ~40 small kernels.

        Our net is so small that the GPU spends most of its time waiting for Python to
        launch kernels. A CUDA graph records the whole forward pass once (per batch-size
        bucket) and replays it with a single launch - roughly 2-4x faster self-play.
        """
        if not self.use_graphs:
            return self.net(x)
        b = x.shape[0]
        bucket = max(8, 1 << (b - 1).bit_length())  # round up to a power of two
        if bucket not in self.graphs:
            static_in = torch.zeros((bucket, *x.shape[1:]), device=self.device)
            side = torch.cuda.Stream()
            side.wait_stream(torch.cuda.current_stream())
            with torch.cuda.stream(side):  # warm-up runs, required before capture
                for _ in range(2):
                    self.net(static_in)
            torch.cuda.current_stream().wait_stream(side)
            graph = torch.cuda.CUDAGraph()
            with torch.cuda.graph(graph):
                static_logits, static_values = self.net(static_in)
            self.graphs[bucket] = (graph, static_in, static_logits, static_values)
        graph, static_in, static_logits, static_values = self.graphs[bucket]
        static_in[:b].copy_(x)
        graph.replay()
        return static_logits[:b], static_values[:b]


class UniformEvaluator:
    """No knowledge at all: equal priors, value 0. MCTS then only learns from game ends."""

    def __call__(self, states):
        return [np.full(len(s.legal_actions()), 1.0 / len(s.legal_actions())) for s in states], np.zeros(len(states))


def default_device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def save_checkpoint(path: Path, net: BaghNet, preset: str, iteration: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    torch.save({"net": net.state_dict(), "preset": preset, "board": net.board, "channels": net.channels,
                "blocks": net.blocks, "iteration": iteration}, tmp)  # fmt: skip
    tmp.replace(path)  # atomic: never leaves a half-written checkpoint


def load_checkpoint(path: Path, device: torch.device) -> tuple[BaghNet, dict]:
    ckpt = torch.load(path, map_location=device, weights_only=True)
    get_preset(ckpt["preset"])  # validates the preset still exists
    net = BaghNet(ckpt["board"], ckpt["channels"], ckpt["blocks"])
    net.load_state_dict(ckpt["net"])
    return net.to(device).eval(), ckpt
