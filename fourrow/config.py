"""Four-in-a-row game config and training presets."""

from dataclasses import dataclass

from core.config import Preset, TrainConfig, with_overrides


@dataclass(frozen=True)
class FourRowConfig:
    """Drop pieces into columns; `connect` in a line wins (rules in fourrow/game.py)."""

    name: str
    rows: int = 6
    cols: int = 7
    connect: int = 4

    def spec(self):
        """What the shared training code (core/) needs to know about this game."""
        from core.spec import GameSpec

        from .agents import FourRowGreedyAgent, LookaheadAgent
        from .game import NUM_PLANES, SIDE_NAMES, State, symmetries

        return GameSpec(
            num_planes=NUM_PLANES, rows=self.rows, cols=self.cols, num_actions=self.cols, side_names=SIDE_NAMES,
            initial=lambda: State.initial(self), symmetries=symmetries(self), make_greedy=FourRowGreedyAgent,
            extra_opponents=lambda: {"lookahead": LookaheadAgent(depth=4, seed=3)},
        )  # fmt: skip


PRESETS: dict[str, Preset] = {
    # The classic 7x6 board. Only 7 actions, so a larger Dirichlet alpha
    # (~10 / number of moves, as in AlphaZero) for the root noise.
    "fourrow": Preset(
        FourRowConfig(name="fourrow"),
        TrainConfig(iterations=60, games_per_iter=200, sims=200, dirichlet_alpha=1.0, temp_plies=8,
                    buffer_size=100_000, train_steps=400, channels=64, blocks=5, eval_every=2),  # fmt: skip
    ),
}


def get_preset(name: str, **train_overrides) -> Preset:
    if name not in PRESETS:
        raise SystemExit(f"unknown preset {name!r}; choose from {', '.join(PRESETS)}")
    return with_overrides(PRESETS[name], **train_overrides)
