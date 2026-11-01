"""Training hyperparameters, shared by every game.

A preset bundles *what game we play* (a game config with a `spec()` method,
e.g. bagh.config.GameConfig) with *how hard we train* (TrainConfig).
"""

from dataclasses import dataclass, field, replace
from typing import Any


@dataclass(frozen=True)
class TrainConfig:
    iterations: int = 30
    games_per_iter: int = 100  # self-play games per iteration (played in parallel)
    sims: int = 100  # MCTS simulations per move during self-play
    c_puct: float = 1.5  # exploration constant in PUCT
    dirichlet_alpha: float = 0.3  # root noise shape (smaller = spikier)
    dirichlet_eps: float = 0.25  # fraction of root prior replaced with noise
    temp_plies: int = 10  # sample moves (temperature 1) for this many plies, then play greedily
    q_weight: float = 0.0  # value target = (1 - q_weight) * game result + q_weight * search value (see self_play)
    buffer_size: int = 50_000  # replay buffer capacity, in positions
    batch_size: int = 256
    lr: float = 1e-3
    lr_final: float | None = None  # if set, the learning rate glides down to this by the last iteration (cosine)
    weight_decay: float = 1e-4
    train_steps: int = 200  # gradient steps per iteration
    arena_games: int = 0  # >0: new net must beat the best net to be promoted (AlphaGo Zero style);
    #                       0: always use the newest net (AlphaZero style, best for drawish games)
    arena_sims: int = 50
    arena_threshold: float = 0.55  # score the new net needs to become "best"
    eval_games: int = 40  # games vs the greedy baseline, per side
    eval_every: int = 1  # run that evaluation every k iterations (it costs time)
    channels: int = 64
    blocks: int = 4
    workers: int = 0  # >0: play self-play games in this many worker processes (core/parallel.py)


@dataclass(frozen=True)
class Preset:
    game: Any  # a game config with a spec() method
    train: TrainConfig = field(default_factory=TrainConfig)


def with_overrides(preset: Preset, **train_overrides) -> Preset:
    """Replace TrainConfig fields that are not None (e.g. from command-line flags)."""
    overrides = {k: v for k, v in train_overrides.items() if v is not None}
    return replace(preset, train=replace(preset.train, **overrides)) if overrides else preset
