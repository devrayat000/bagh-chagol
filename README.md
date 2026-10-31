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

uv run main.py train --preset fourrow      # four-in-a-row, 7x6 (same AlphaZero code)
uv run main.py eval  --preset fourrow      # vs random / greedy / alpha-beta depth 4
uv run main.py play  --preset fourrow      # pygame window; --side yellow to move second
```

**Web game:** a kaplay version of both games (Bagh-Chagol and Four in a Row) you can play in
the browser lives in [`web/`](web/README.md). Export trained networks to it with
`uv run --group web export_web.py` (or `... export_web.py fourrow` for one game).

Bagh-chal presets (`bagh/config.py`; four-in-a-row presets are in `fourrow/config.py`):

| preset | board | pieces | first move | tiger wins after | perfect play |
|---|---|---|---|---|---|
| `tiny`  | 3×3 alquerque | 1 tiger, 3 goats | tiger | 1 capture | draw |
| `hourglass` | 13-point hourglass | tiger on 9, goats on 1–7 | goat | 3 captures | goats win in 29 plies |
| `small` | 5×5 alquerque | 1 tiger, 8 goats | tiger | 3 captures | unknown (too big) |
| `full`  | 5×5 alquerque | 4 tigers, 12 goats | tiger | 4 captures | unknown (too big) |

See [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) for how every part works.

The code is split into a shared AlphaZero library and one folder per game:

| file | role |
|---|---|
| **`core/`** | **shared by every game** |
| `core/spec.py` | `GameSpec`: what training needs to know about a game; `DRAW`, `outcome` |
| `core/config.py` | `TrainConfig` hyperparameters, `Preset` |
| `core/net.py` | ResNet policy/value network, CUDA-graph inference |
| `core/mcts.py` | batched PUCT Monte Carlo Tree Search |
| `core/selfplay.py` | self-play data generation and matches |
| `core/train.py` | the AlphaZero training loop |
| `core/evaluate.py` | trained net vs baselines |
| `core/symmetry.py` | applies a board symmetry to a batch (augmentation) |
| `core/baselines.py` | random opponent |
| **`bagh/`** | **বাঘ-ছাগল** |
| `bagh/boards.py` | board shapes: points + lines (alquerque, hourglass) |
| `bagh/game.py` | rules, move encoding, network input planes |
| `bagh/config.py` | `GameConfig` + presets |
| `bagh/solver.py` | exact retrograde solver (≤ ~3M positions), used as ground truth |
| `bagh/symmetry.py` | the board's symmetries (up to 8) |
| `bagh/baselines.py` | greedy opponent |
| `bagh/play.py` | Pygame UI |
| **`fourrow/`** | **four-in-a-row** |
| `fourrow/game.py` | rules, input planes, mirror symmetry |
| `fourrow/config.py` | `FourRowConfig` + presets |
| `fourrow/agents.py` | greedy and alpha-beta opponents |
| `fourrow/play.py` | Pygame UI |
| `presets.py` | every game's presets, by name (used by `main.py`) |

Adding a game = a new folder with a `State` class (`legal_actions`, `apply`, `winner`,
`encode`, `to_play`, `ply`, `num_actions`), a config with a `spec()` method, and its
presets registered in `presets.py`.
