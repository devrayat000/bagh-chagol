"""Evaluate a trained network against the baselines (and perfect play when the game is solvable)."""

from __future__ import annotations

from .baselines import RandomAgent
from .config import Preset
from .mcts import MCTS, MCTSAgent
from .net import NetEvaluator, default_device, load_checkpoint
from .selfplay import format_results, play_match, score
from .spec import spec_of
from .train import CHECKPOINT_DIR, perfect_move_accuracy


def evaluate(preset_name: str, preset: Preset, sims: int, games: int) -> None:
    game = preset.game
    spec = spec_of(game)
    side0, side1 = spec.side_names
    device = default_device()
    net, ckpt = load_checkpoint(CHECKPOINT_DIR / preset_name / "best.pt", device)
    agent = MCTSAgent(MCTS(NetEvaluator(net, device), sims))  # deterministic: its real strength
    print(f"best.pt from iteration {ckpt['iteration']}, {sims} sims/move, {games} games per line")

    opponents = {"random": RandomAgent(1), "greedy": spec.make_greedy(2), **spec.extra_opponents()}
    for name, opp in opponents.items():
        a = play_match(agent, opp, game, games)
        b = play_match(opp, agent, game, games)
        print(f"  as {side0} vs {name:9s} {format_results(a, spec.letters):16s} score {score(a, 0):.2f}   "
              f"as {side1} vs {name:9s} {format_results(b, spec.letters):16s} score {score(b, 1):.2f}")  # fmt: skip

    if spec.perfect_positions:
        acc = perfect_move_accuracy(net, device, spec.perfect_positions(5000, 0))
        print(f"  raw network picks a perfect move in {acc:.1%} of 5000 sampled decisive positions (no search)")
