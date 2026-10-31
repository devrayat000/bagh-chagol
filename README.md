# বাঘ-ছাগল (Bagh-Chagol): AlphaZero-lite in PyTorch

A self-play reinforcement-learning agent for the Bengali hunt game বাঘ-ছাগল,
played on the square alquerque board or the local 13-point hourglass board. The tiger captures goats by jumping over them,
and the goats try to trap the tiger. You can play against the trained agent in a Pygame window.

```
uv sync
uv run pytest                              # rule tests
uv run main.py solve --preset tiny         # exact perfect-play analysis (3x3)
uv run main.py train --preset tiny         # ~3 min on an RTX 3060 laptop GPU
uv run main.py eval  --preset tiny         # vs random / greedy / perfect play
uv run main.py play  --preset tiny         # play against it
uv run main.py train --preset hourglass    # the local 13-point board
uv run main.py play  --preset hourglass
uv run main.py train --preset small        # 5x5, ~1.5 h
```

Presets (`bagh/config.py`):

| preset | board | pieces | first move | tiger wins after | perfect play |
|---|---|---|---|---|---|
| `tiny`  | 3×3 alquerque | 1 tiger, 3 goats | tiger | 1 capture | draw |
| `hourglass` | 13-point hourglass | tiger on 9, goats on 1–7 | goat | 3 captures | goats win in 29 plies |
| `small` | 5×5 alquerque | 1 tiger, 8 goats | tiger | 3 captures | unknown (too big) |
| `full`  | 5×5 alquerque | 4 tigers, 12 goats | tiger | 4 captures | unknown (too big) |

See [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) for how every part works.

| file | role |
|---|---|
| `bagh/boards.py` | board shapes: points + lines (alquerque, hourglass) |
| `bagh/game.py` | rules, move encoding, network input planes |
| `bagh/solver.py` | exact retrograde solver (≤ ~3M positions), used as ground truth |
| `bagh/net.py` | ResNet policy/value network, CUDA-graph inference |
| `bagh/mcts.py` | batched PUCT Monte Carlo Tree Search |
| `bagh/selfplay.py` | self-play data generation and matches |
| `bagh/train.py` | the AlphaZero training loop |
| `bagh/symmetry.py` | 8× data augmentation |
| `bagh/baselines.py` | random and greedy opponents |
| `bagh/play.py` | Pygame UI |
