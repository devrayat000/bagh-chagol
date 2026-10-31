"""বাঘ-ছাগল (Bagh-Chagol) RL - command line entry point.

    uv run main.py solve --preset tiny          # perfect-play analysis (3x3 only)
    uv run main.py train --preset tiny          # AlphaZero self-play training
    uv run main.py eval  --preset tiny          # trained net vs baselines
    uv run main.py play  --preset tiny          # play against it in a window

    uv run main.py train --preset fourrow       # four-in-a-row (7x6)
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
        p.add_argument("--preset", default="tiny", help="tiny | hourglass | small | full | fourrow")

    p_train.add_argument("--iterations", type=int)
    p_train.add_argument("--games", type=int, dest="games_per_iter")
    p_train.add_argument("--sims", type=int)
    p_train.add_argument("--resume", action="store_true", help="continue from checkpoints/<preset>/latest.pt")
    p_train.add_argument("--seed", type=int, default=0)

    p_eval.add_argument("--sims", type=int, default=100)
    p_eval.add_argument("--games", type=int, default=100)

    p_play.add_argument("--opponent", default="net", choices=["net", "solver", "greedy", "random", "mcts", "lookahead"],
                        help="net = trained network + MCTS; mcts = MCTS without a network; "
                             "solver = bagh only; lookahead = four-in-a-row only")  # fmt: skip
    p_play.add_argument("--side", choices=["tiger", "goat", "red", "yellow"],
                        help="the side YOU play (default: goat / red)")  # fmt: skip
    p_play.add_argument("--sims", type=int, default=200, help="AI search strength")
    p_play.add_argument("--checkpoint", type=Path)

    args = parser.parse_args()

    from fourrow.config import FourRowConfig
    from presets import get_preset

    fourrow = isinstance(get_preset(args.preset).game, FourRowConfig)

    if args.cmd == "solve":
        if fourrow:
            raise SystemExit("solve only works for the bagh-chal presets")
        from bagh.solver import describe

        print(describe(get_preset(args.preset).game))

    elif args.cmd == "train":
        from core.train import train

        preset = get_preset(args.preset, iterations=args.iterations, games_per_iter=args.games_per_iter,
                            sims=args.sims)  # fmt: skip
        train(args.preset, preset, resume=args.resume, seed=args.seed)

    elif args.cmd == "eval":
        from core.evaluate import evaluate

        evaluate(args.preset, get_preset(args.preset), args.sims, args.games)

    elif args.cmd == "play":
        valid = ("red", "yellow") if fourrow else ("tiger", "goat")
        side = args.side or valid[0 if fourrow else 1]
        if side not in valid:
            raise SystemExit(f"--side must be one of {', '.join(valid)} for preset {args.preset}")
        if args.opponent in (("solver",) if fourrow else ("lookahead",)):
            raise SystemExit(f"--opponent {args.opponent} is not available for preset {args.preset}")
        if fourrow:
            from fourrow.play import run
        else:
            from bagh.play import run

        run(args.preset, args.opponent, side, args.sims, args.checkpoint)


if __name__ == "__main__":
    main()
