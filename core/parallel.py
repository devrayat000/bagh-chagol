"""Self-play on several CPU cores at once.

MCTS runs in plain Python, so a single process keeps one CPU core busy while the
GPU (and the other cores) mostly wait. Here a pool of worker processes each plays
its own share of the games with its own copy of the network, and the main
process only collects the samples and trains.

Each worker keeps one network for its whole life (built once, with CUDA graphs
recorded once); every iteration we just copy the newest weights into it.
"""

from __future__ import annotations

import multiprocessing as mp
from collections import Counter

import numpy as np
import torch

from .config import Preset
from .mcts import MCTS
from .net import NetEvaluator, build_net
from .selfplay import Sample, self_play

_worker: dict = {}  # per-process state: the preset, network and evaluator


def _init(preset: Preset, device: str) -> None:
    torch.set_num_threads(1)  # one core per worker; the parallelism comes from the processes
    dev = torch.device(device)
    net = build_net(preset.game, preset.train).to(dev).eval()
    _worker.update(preset=preset, net=net, evaluator=NetEvaluator(net, dev))


def _play(state_dict: dict, n_games: int, seed: int) -> tuple[list[Sample], Counter]:
    w = _worker
    w["net"].load_state_dict(state_dict)  # copies in place, so the recorded CUDA graphs stay valid
    tc = w["preset"].train
    mcts = MCTS(w["evaluator"], tc.sims, tc.c_puct, tc.dirichlet_alpha, tc.dirichlet_eps, seed=seed)
    return self_play(mcts, w["preset"].game, n_games, tc.temp_plies, np.random.default_rng(seed), tc.q_weight)


class SelfPlayPool:
    def __init__(self, preset: Preset, workers: int, device: torch.device):
        # "spawn" works the same on Windows, macOS and Linux, and is the only safe choice with CUDA.
        self.pool = mp.get_context("spawn").Pool(workers, initializer=_init, initargs=(preset, str(device)))
        self.workers = workers

    def play(self, net: torch.nn.Module, n_games: int, rng: np.random.Generator) -> tuple[list[Sample], Counter]:
        weights = {k: v.detach().cpu() for k, v in net.state_dict().items()}
        shares = [n_games // self.workers + (i < n_games % self.workers) for i in range(self.workers)]
        jobs = [(weights, n, int(rng.integers(1 << 31))) for n in shares if n]
        samples, results = [], Counter()
        for s, r in self.pool.starmap(_play, jobs):
            samples += s
            results += r
        return samples, results

    def close(self) -> None:
        self.pool.close()
        self.pool.join()
