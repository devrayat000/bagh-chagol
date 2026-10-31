"""Playing games: self-play data generation and matches between agents.

All games in a batch start from the same position and advance in lock-step,
so at every step every unfinished game has the same side to move. That lets
us hand the whole batch to one agent (and the GPU) at once.
"""

from __future__ import annotations

from collections import Counter

import numpy as np

from .config import GameConfig
from .game import DRAW, GOAT_SIDE, TIGER_SIDE, State, outcome
from .mcts import MCTS, select_action

Sample = tuple[np.ndarray, np.ndarray, float]  # (planes, MCTS policy pi, final result z)


def self_play(mcts: MCTS, cfg: GameConfig, n_games: int, temp_plies: int,
              rng: np.random.Generator) -> tuple[list[Sample], Counter]:  # fmt: skip
    """Play n_games of the agent against itself.

    Every position yields one training sample:
      planes - what the net sees
      pi     - MCTS visit distribution (the improved policy we want the net to imitate)
      z      - how the game actually ended, from the view of the side to move then
    """
    states = [State.initial(cfg)] * n_games
    ids = list(range(n_games))
    history: list[list[tuple[np.ndarray, np.ndarray, int]]] = [[] for _ in range(n_games)]
    results: dict[int, int] = {}

    while states:
        visits, _ = mcts.search(states, add_noise=True)
        next_states, next_ids = [], []
        for gid, s, v in zip(ids, states, visits):
            history[gid].append((s.encode(), v / v.sum(), s.to_play))
            a = select_action(v, 1.0 if s.ply < temp_plies else 0.0, rng)
            nxt = s.apply(a)
            w = nxt.winner()
            if w is None:
                next_states.append(nxt)
                next_ids.append(gid)
            else:
                results[gid] = w
        states, ids = next_states, next_ids

    samples = [
        (planes, pi, outcome(results[gid], side)) for gid in range(n_games) for planes, pi, side in history[gid]
    ]
    return samples, Counter(results.values())


def play_match(tiger_agent, goat_agent, cfg: GameConfig, n_games: int) -> Counter:
    """Returns a Counter of winners: TIGER_SIDE, GOAT_SIDE, DRAW."""
    states = [State.initial(cfg)] * n_games
    results = Counter()
    while states:
        agent = tiger_agent if states[0].to_play == TIGER_SIDE else goat_agent
        next_states = []
        for s, a in zip(states, agent.act(states)):
            nxt = s.apply(a)
            w = nxt.winner()
            if w is None:
                next_states.append(nxt)
            else:
                results[w] += 1
        states = next_states
    return results


def score(results: Counter, side: int) -> float:
    """Match score for `side`: win = 1, draw = 0.5, loss = 0."""
    total = sum(results.values())
    return (results[side] + 0.5 * results[DRAW]) / total if total else 0.0


def format_results(results: Counter) -> str:
    return f"T{results[TIGER_SIDE]}/G{results[GOAT_SIDE]}/D{results[DRAW]}"

