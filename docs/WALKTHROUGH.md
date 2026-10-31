# Walkthrough: teaching a network to play বাঘ-ছাগল

This guide explains how each piece of the project works and why, in the order it
was built. Read it next to the code. Every step has a command you can run to
see that step working.

```
uv run pytest                                   # step 1: the rules are right
uv run main.py solve --preset tiny              # step 2: perfect play on 3x3
uv run main.py train --preset tiny              # step 4: ~3 minutes on an RTX 3060
uv run main.py eval  --preset tiny              # how good did it get?
uv run main.py play  --preset tiny              # step 5: play against it
uv run main.py train --preset small             # step 6: 5x5, ~1.5 hours
uv run main.py train --preset hourglass         # step 7: the local 13-point board
```

---

## The big picture: why AlphaZero?

Board games have two properties that make them perfect for AlphaZero:

1. **We know the rules exactly.** The agent can "imagine" moves ahead by searching
   the game tree. Atari-style RL (DQN) can't do that.
2. **There are two players**, so the agent can play itself. As it gets stronger,
   its opponent gets stronger too, which works like an automatic curriculum.

AlphaZero combines two things:

| Part | What it does | Weakness alone |
|---|---|---|
| **Neural network** `f(position) -> (policy, value)` | Intuition: "these moves look promising" and "I'm probably winning (+0.7)". | Makes blunders; it never looks ahead. |
| **MCTS** (tree search) | Calculation: tries moves, looks ahead, and backs up results. | Without intuition, it's hopeless in long games. |

The training loop makes each one improve the other:

```
       ┌──────────────── self-play ────────────────┐
       │   network + MCTS play games vs themselves │
       ▼                                           │
  (position, MCTS policy π, final result z)        │
       │                                           │
       ▼                                           │
  train network:  policy → π,  value → z ──────────┘
```

MCTS with the network is **stronger** than the network alone. So MCTS's
move distribution `π` is a better policy than the network's own output, and
we train the network to imitate it. Next round, MCTS uses a better network
and becomes stronger still. This repeats with no human games and no
hand-written strategy.

---

## Step 1: the rules (`bagh/game.py`)

**The board** (`bagh/boards.py`) is a list of points with grid positions, plus
the straight lines drawn through them. Everything else follows from the lines:
neighbours on a line are connected, and any three consecutive points on a line
form a possible jump. `Geometry` precomputes, for each point:

- `steps[p]`: adjacent points (where a piece can step);
- `jumps[p]`: `(over, land)` pairs (where a tiger can jump).

The square alquerque board from the photo is one such board: rows, columns, and
diagonals through the points where `(row + col)` is even. The local hourglass
board is another (see step 7).

**A move** is encoded as one integer, `from * P + to` (P = number of points).
That turns "pick a move" into "pick one of P² classes", which a neural network
handles naturally. On 5×5 that's 625 outputs (169 on the hourglass), of which only about 3 to 20 are
legal in any position. We **mask** the rest: we only ever read the network's
scores at legal indices.

**End of game:**
- The tiger captures `captures_to_win` goats → **tiger wins**.
- The side to move has no legal move → **that side loses** (goats trapped the tiger).
- `max_plies` half-moves pass → **draw**. This rule is essential. All pieces start on
  the board and nothing forces progress, so without it two cautious players
  could shuffle forever and self-play games would never end.

**`encode()`** turns a position into what the network sees: a stack of small
"images" (planes), with each point drawn at its grid position:

| plane | meaning |
|---|---|
| 0 | 1 where a tiger is |
| 1 | 1 where a goat is |
| 2 | all 1 if goat to move, all 0 if tiger to move |
| 3 | captures / captures_to_win (constant plane) |
| 4 | ply / max_plies (how close the draw is) |
| 5 | 1 at grid cells that are board points (the hourglass leaves some cells empty) |
| 6 | number of lines meeting at each point, scaled to [0, 1] (the board's shape) |

Plane 2 matters because **one network plays both sides**. Plane 4 matters
because a position with 2 moves left before a draw is very different from the
same position at move 1.

`State` is **immutable**: `apply(a)` returns a new State. MCTS keeps thousands
of positions in its tree, and none of them may be changed by accident.

`tests/test_game.py` checks adjacency, jumps, captures, trapping, draws, and
that random games always end.

---

## Step 2: ground truth from a perfect solver (`bagh/solver.py`)

Small games can be solved exactly by **retrograde analysis**, working backward
from the end of the game:

1. Find every position reachable from the start.
2. Finished positions are solved: "the side to move has lost (or won) in 0".
3. Work outward in order of distance. If *any* move leads to a position the opponent
   loses, I win. If *all* moves lead to positions the opponent wins, I lose.
   Anything never solved is a draw even with unlimited moves.

This also gives a **distance to the end** for each won or lost position. With the draw
rule, a position with r plies left is a win only if it can be forced within r plies.
Each position is solved once whatever move number it occurs at, so 3×3
(~1k positions) and the hourglass (~65k) take about a second. `tests/` checks it against
plain minimax.

```
$ uv run main.py solve --preset tiny
Perfect play result: draw
```

So perfect play on 3×3 is a **draw**. In thousands of positions, though,
some moves lose, and these become our exam. "Perfect-move accuracy" is
the fraction of those positions where the network's top move keeps the best
result. This is the most valuable debugging tool in the project. When training
misbehaves, you can't tell whether the cause is a bug or just a hard game, but on
a solvable board you can.

---

## Step 3: the network (`bagh/net.py`)

A small **ResNet**, like the one AlphaZero used, scaled down:

```
planes (7×N×N) → conv3x3 → [ResBlock × B] ─┬→ policy head → P² logits
                                           └→ value head  → tanh → v ∈ [-1, 1]
```

- **Residual blocks** (conv-BN-ReLU-conv-BN plus a skip connection) let us stack
  layers without the training signal fading out.
- **The policy head** outputs a score for every (from, to) pair. Softmax over the *legal*
  ones gives the prior `P(move)`.
- **The value head** predicts the game result from the side to move's view: +1
  win, -1 loss, 0 draw.

Sizes: `tiny` uses 32 channels × 2 blocks (44k parameters), and `small` uses
64 × 4 (367k parameters). That is far below what 6 GB of VRAM can hold, because these
games are small. VRAM is not the limit here; speed is.

**CUDA graphs** (`NetEvaluator._forward`): with a net this small, the GPU sits
idle waiting for Python to launch ~40 tiny kernels per forward pass. A CUDA
graph records the forward pass once and replays it with a single launch. That
alone made self-play **2.1× faster**.

---

## Step 4a: MCTS (`bagh/mcts.py`)

Each **simulation** does this:

1. **Select:** from the root, repeatedly go to the child with the highest
   ```
   Q(child) + c_puct · P(child) · √N(parent) / (1 + N(child))
   ```
   `Q` is the average result so far (exploitation). The second term is large for moves the
   network likes (`P`) that haven't been visited much (`N`), which is exploration.
2. **Expand + evaluate:** at a new position, ask the network for `(P, v)`.
   At a finished game, use the real result instead.
3. **Backup:** add `v` to every node on the path, **flipping the sign each
   level**, because a good result for me is a bad one for my opponent.

After `sims` simulations, the **visit counts** at the root are the improved policy.
More visits means search found the move good *repeatedly*.

Self-play adds two extras for exploration:
- **Dirichlet noise** on the root priors (`dirichlet_alpha`, `dirichlet_eps`), so
  even a confident network sometimes tries other moves.
- **Temperature:** for the first `temp_plies` moves, sample moves in proportion to
  visits instead of always taking the best one. This gives varied openings and therefore
  varied training data.

**Batching:** Python MCTS on one game at a time would call the GPU with batch
size 1, which wastes it. `search(states)` runs the trees of *all* games side by
side and sends one leaf from each tree to the network in a single batch. With 100
self-play games, each network call evaluates up to 100 positions.

Even *without* a network (`UniformEvaluator`: flat priors, value 0), MCTS
already beats random play on 3×3. On 5×5 it mostly can't, because the end of the
game is too far away to see. That gap is exactly what the value network fills.

## Step 4b: self-play and training (`bagh/selfplay.py`, `bagh/train.py`)

**Self-play** records, for every position: `(planes, π = visit distribution,
z = final result from that player's view)`.

**Training** samples batches from a **replay buffer** (the last ~50k positions)
and minimizes:

```
loss = −Σ π · log softmax(policy_logits)    # policy: imitate the search
     + (z − v)²                             # value: predict the real outcome
     + weight decay                         # (in the Adam optimizer) keeps weights small
```

**Symmetry augmentation** (`bagh/symmetry.py`): rotating or mirroring the board
gives an equally valid position with the correspondingly rotated best move.
The code tries all 8 rotations and mirrors and keeps the ones that map lines onto
lines. That's 8 for the square board, and 4 for the hourglass (left-right
mirror, top-bottom mirror, 180° turn). Each batch is randomly transformed:
free extra data. A test checks that the legal moves of a transformed board equal
the transformed legal moves.

**Mixed precision (AMP):** the forward pass during training runs in float16 on
the GPU, which is faster with no loss of quality for a net like this.

### A lesson from the first run: the arena gate

AlphaGo Zero only accepted a newly trained network if it beat the current
best by a 55% score. On the first `tiny` run this **stalled training**. Perfect
play is a draw, so new vs best scored ~0.50 almost every time, nets were
rarely promoted, and accuracy stuck at 80%. Turning the gate off
(`arena_games = 0`, which is what AlphaZero later did too) brought accuracy to 92–96%
within 15 iterations. The gate is still in the code; set `arena_games > 0`
to try it.

### Reading the training log

```
[  9] buf= 21819 selfplay=T9/G0/D91 loss_p=1.231 loss_v=0.085 | as tiger vs greedy T0/G0/D40, as goat vs greedy T0/G0/D40 | perfect-move acc 88.8%
```

- `selfplay=T9/G0/D91`: results of self-play games (tiger wins / goat wins /
  draws). Early on, one side blunders a lot. As both sides learn, the results
  move toward the true result (a draw on 3×3).
- `loss_p` cannot reach 0, because `π` is spread over several good moves.
  What matters is that it decreases.
- `loss_v` measures how well the net predicts the outcome. It can *rise*
  early, when games stop being all draws and outcomes become worth predicting.
- `as tiger/goat vs greedy`: the agent should essentially never lose these.
- `perfect-move acc` (3×3 only): the raw network without search. With search
  on top, it plays perfectly:
  ```
  $ uv run main.py eval --preset tiny
    as tiger vs perfect  T0/G0/D100   as goat vs perfect  T0/G0/D100
  ```

Everything is logged to `checkpoints/<preset>/log.csv`. You can open it in a
spreadsheet or pandas to plot learning curves.

---

## Step 5: play against it (`bagh/play.py`)

```
uv run main.py play --preset tiny                    # you are the goats (default)
uv run main.py play --preset tiny --side tiger
uv run main.py play --preset tiny --opponent solver  # a perfect opponent
uv run main.py play --preset small --sims 400        # stronger (slower) AI
```

Click a piece, then click its destination: green dots are moves, red dots
are captures. **U** undoes, **R** restarts, **S** switches sides, and **+/-** doubles or halves the
AI's search. The AI thinks on a background thread so the window stays
responsive. "AI's evaluation" is its MCTS root value: +1 means it believes it's
winning.

---

## Step 6: scaling up (`small`, then `full`)

```
uv run main.py train --preset small           # ~85 s/iteration, 60 iterations ≈ 1.5 h
uv run main.py train --preset small --resume  # continue later from latest.pt
```

Things to know:

- **Where the time goes:** about half is Python MCTS (tree walking), and half is
  network calls. The GPU is barely busy, which is normal for small board games.
  Ways to speed up, from easiest to hardest: fewer `sims` early on (`--sims 100`);
  more parallel games (`--games 200`, which means bigger GPU batches); tree reuse
  between moves; or rewriting MCTS in C++ or Numba.
- **Balance:** with 1 tiger vs 8 goats, the goats rarely trap the tiger in early
  training, so expect lots of draws and tiger wins at first. If the trained agent
  shows one side can never win, change the preset (more goats, a different
  `captures_to_win`, a different start) in `bagh/config.py`. That's game design, and
  the RL agent is a great playtester for it.
- **No ground truth on 5×5:** use the greedy evaluation and your own games. A good
  sign is the tiger agent never losing to greedy goats and the goat agent
  never losing to the greedy tiger.
- **`full`** (4 tigers, 12 goats, like the photo) uses a bigger net (96 × 6). It
  will need several hours. Train `small` first.

## Step 7: the local hourglass board

```
     1 ------ 2 ------ 3
        4 --- 5 --- 6
              7
        8 --- 9 --- 10
    11 ----- 12 ----- 13
```
Lines: the four rows, the vertical 2-5-7-9-12, and the diagonals 1-4-7-10-13 and
3-6-7-8-11. The tiger starts on 9, goats on 1–7, and **goats move first**.

It's defined in `hourglass()` in `bagh/boards.py`: 13 grid positions and 7
lines. Nothing else in the code had to know about this board. The same
network, MCTS and training loop work unchanged, because they only see points,
lines and planes.

**What the solver says:**
```
$ uv run main.py solve --preset hourglass
Perfect play result: goat wins in 29 plies
```
With perfect play **the goats always trap the tiger**, whatever the capture target
(29 plies, or 35 if the goats may not lose a single goat). That gives the RL agent
a real test. As goat it must find a precise 29-ply trap, and one slip lets the tiger
escape to a draw (or capture). As tiger it must make the trap as hard as possible to
find. The default preset uses `captures_to_win=3`, `max_plies=60`. Change those in
`bagh/config.py` to match your village rules.

**To add your own board**, write a function like `hourglass()` with point
positions, lines and labels, register it in `BOARDS`, and add a preset.

## Ideas for later

- **Placement phase:** goats enter the board one per turn, as in many village
  rule sets. Add a "drop" action (P extra actions) and a goats-in-hand plane.
- **Multi-jump captures:** the tiger keeps jumping in one turn.
- **Repetition rule:** a draw on threefold repetition instead of a ply limit.
- **Learning-rate schedule:** lowering `lr` late in training reduces the
  iteration-to-iteration wobble you see in perfect-move accuracy.
