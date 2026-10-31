"""Evaluate a trained network against the baselines (and perfect play when the game is solvable)."""

from __future__ import annotations

from .baselines import GreedyAgent, RandomAgent
from .config import get_preset
from .game import GOAT_SIDE, TIGER_SIDE
from .mcts import MCTS, MCTSAgent
from .net import NetEvaluator, default_device, load_checkpoint
from .solver import SolverAgent, can_solve, get_solver
from .selfplay import format_results, play_match, score
from .train import CHECKPOINT_DIR, perfect_move_accuracy


def evaluate(preset_name: str, sims: int, games: int) -> None:
    game = get_preset(preset_name).game
    device = default_device()
    net, ckpt = load_checkpoint(CHECKPOINT_DIR / preset_name / "best.pt", device)
    agent = MCTSAgent(MCTS(NetEvaluator(net, device), sims))  # deterministic: its real strength
    print(f"best.pt from iteration {ckpt['iteration']}, {sims} sims/move, {games} games per line")

    opponents = {"random": RandomAgent(1), "greedy": GreedyAgent(2)}
    solvable = can_solve(game)
    if solvable:
        opponents["perfect"] = SolverAgent(game, seed=3)
    for name, opp in opponents.items():
        t = play_match(agent, opp, game, games)
        g = play_match(opp, agent, game, games)
        print(f"  as tiger vs {name:8s} {format_results(t):16s} score {score(t, TIGER_SIDE):.2f}   "
              f"as goat vs {name:8s} {format_results(g):16s} score {score(g, GOAT_SIDE):.2f}")  # fmt: skip

    if solvable:
        acc = perfect_move_accuracy(net, device, get_solver(game).decisive_positions(limit=5000))
        print(f"  raw network picks a perfect move in {acc:.1%} of 5000 sampled decisive positions (no search)")
