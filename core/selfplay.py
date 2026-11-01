"""Playing games: self-play data generation and matches between agents.

All games in a batch start from the same position and advance in lock-step,
so at every step every unfinished game has the same side to move. That lets
us hand the whole batch to one agent (and the GPU) at once.
"""

from __future__ import annotations

from collections import Counter

import numpy as np

from .mcts import MCTS, select_action
from .spec import DRAW, outcome, spec_of

Sample = tuple[np.ndarray, np.ndarray, float]  # (planes, MCTS policy pi, final result z)


def self_play(mcts: MCTS, cfg, n_games: int, temp_plies: int,
              rng: np.random.Generator, q_weight: float = 0.0) -> tuple[list[Sample], Counter]:  # fmt: skip
    """Play n_games of the agent against itself.

    Every position yields one training sample:
      planes - what the net sees
      pi     - MCTS visit distribution (the improved policy we want the net to imitate)
      z      - how the game actually ended, from the view of the side to move then;
               with q_weight > 0, blended with q, the search's own estimate of the position:
                   target = (1 - q_weight) * z + q_weight * q
               z alone is noisy (one exploratory move late in the game can flip it);
               q is a steadier, if biased, opinion of the same position.
    """
    states = [spec_of(cfg).initial()] * n_games
    ids = list(range(n_games))
    history: list[list[tuple[np.ndarray, np.ndarray, int, float]]] = [[] for _ in range(n_games)]
    results: dict[int, int] = {}

    while states:
        visits, root_values = mcts.search(states, add_noise=True)
        next_states, next_ids = [], []
        for gid, s, v, q in zip(ids, states, visits, root_values):
            history[gid].append((s.encode(), v / v.sum(), s.to_play, q))
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
        (planes, pi, (1 - q_weight) * outcome(results[gid], side) + q_weight * q)
        for gid in range(n_games)
        for planes, pi, side, q in history[gid]
    ]
    return samples, Counter(results.values())


def play_match(first_agent, second_agent, cfg, n_games: int) -> Counter:
    """first_agent plays side 0 (tiger / red), second_agent side 1. Returns a Counter of winners: 0, 1, DRAW."""
    states = [spec_of(cfg).initial()] * n_games
    results = Counter()
    while states:
        agent = first_agent if states[0].to_play == 0 else second_agent
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


def format_results(results: Counter, letters: str = "TG") -> str:
    return f"{letters[0]}{results[0]}/{letters[1]}{results[1]}/D{results[DRAW]}"

