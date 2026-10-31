"""বাঘ-ছাগল (Bagh-Chagol) RL - command line entry point.

    uv run main.py solve --preset tiny          # perfect-play analysis (3x3 only)
    uv run main.py train --preset tiny          # AlphaZero self-play training
    uv run main.py eval  --preset tiny          # trained net vs baselines
    uv run main.py play  --preset tiny          # play against it in a window
"""

import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Bagh-Chagol AlphaZero-lite")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_solve = sub.add_parser("solve", help="solve a tiny board exactly")
    p_train = sub.add_parser("train", help="train with self-play")
    p_eval = sub.add_parser("eval", help="evaluate the trained net vs baselines")
    p_play = sub.add_parser("play", help="play against an agent in a pygame window")
    for p in (p_solve, p_train, p_eval, p_play):
        p.add_argument("--preset", default="tiny", help="tiny | small | full")

    p_train.add_argument("--iterations", type=int)
    p_train.add_argument("--games", type=int, dest="games_per_iter")
    p_train.add_argument("--sims", type=int)
    p_train.add_argument("--resume", action="store_true", help="continue from checkpoints/<preset>/latest.pt")
    p_train.add_argument("--seed", type=int, default=0)

    p_eval.add_argument("--sims", type=int, default=100)
    p_eval.add_argument("--games", type=int, default=100)

    p_play.add_argument("--opponent", default="net", choices=["net", "solver", "greedy", "random", "mcts"],
                        help="net = trained network + MCTS; mcts = MCTS without a network")  # fmt: skip
    p_play.add_argument("--side", default="goat", choices=["tiger", "goat"], help="the side YOU play")
    p_play.add_argument("--sims", type=int, default=200, help="AI search strength")
    p_play.add_argument("--checkpoint", type=Path)

    args = parser.parse_args()

    from bagh.config import get_preset

    if args.cmd == "solve":
        from bagh.solver import describe

        print(describe(get_preset(args.preset).game))

    elif args.cmd == "train":
        from bagh.train import train

        preset = get_preset(args.preset, iterations=args.iterations, games_per_iter=args.games_per_iter,
                            sims=args.sims)  # fmt: skip
        train(args.preset, preset, resume=args.resume, seed=args.seed)

    elif args.cmd == "eval":
        from bagh.evaluate import evaluate

        evaluate(args.preset, args.sims, args.games)

    elif args.cmd == "play":
        from bagh.play import run

        run(args.preset, args.opponent, args.side, args.sims, args.checkpoint)


if __name__ == "__main__":
    main()
