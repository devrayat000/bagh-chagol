import numpy as np
import torch

from core.net import build_net
from core.spec import DRAW, spec_of
from core.symmetry import transform_batch
from fourrow.agents import FourRowGreedyAgent, LookaheadAgent
from fourrow.config import FourRowConfig, get_preset
from fourrow.game import State, symmetries

CFG = FourRowConfig("t")


def play(*cols: int) -> State:
    s = State.initial(CFG)
    for c in cols:
        s = s.apply(c)
    return s


def test_pieces_fall_to_the_bottom():
    s = play(3, 3)
    assert s.grid[5, 3] == 1 and s.grid[4, 3] == 2
    assert s.heights[3] == 2 and s.to_play == 0 and s.winner() is None


def test_horizontal_win_at_edge():
    s = play(0, 0, 1, 1, 2, 2, 3)
    assert s.winner() == 0


def test_vertical_win_for_second_player():
    s = play(0, 6, 1, 6, 0, 6, 1, 6)
    assert s.winner() == 1


def test_diagonal_wins():
    # / diagonal for side 0: (5,0) (4,1) (3,2) (2,3)
    s = play(0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3)
    assert s.winner() == 0
    # \ diagonal, the mirror image of the same game
    s = play(*(6 - c for c in (0, 1, 1, 2, 2, 3, 2, 3, 3, 0, 3)))
    assert s.winner() == 0


def test_three_in_a_row_is_not_a_win():
    assert play(0, 0, 1, 1, 2).winner() is None


def test_full_column_is_illegal():
    s = play(0, 0, 0, 0, 0, 0)
    assert 0 not in s.legal_actions() and len(s.legal_actions()) == 6


def has_four(grid: np.ndarray, piece: int) -> bool:
    """Brute-force check of every line, independent of State.winner."""
    rows, cols = grid.shape
    for r in range(rows):
        for c in range(cols):
            for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
                cells = [(r + i * dr, c + i * dc) for i in range(4)]
                if all(0 <= rr < rows and 0 <= cc < cols and grid[rr, cc] == piece for rr, cc in cells):
                    return True
    return False


def test_full_board_without_line_is_a_draw():
    order = [5, 5, 5, 0, 5, 4, 4, 6, 6, 3, 5, 1, 3, 5, 2, 1, 2, 3, 0, 4, 1, 4, 3, 0, 2, 2, 2, 1, 0, 0, 0, 2, 1, 6,
             1, 3, 4, 4, 3, 6, 6, 6]  # fmt: skip  (a drawn random game)
    s = State.initial(CFG)
    for c in order:
        assert s.winner() is None
        s = s.apply(c)
    assert not has_four(s.grid, 1) and not has_four(s.grid, 2)
    assert s.winner() == DRAW


def test_winner_matches_brute_force():
    rng = np.random.default_rng(1)
    for _ in range(300):
        s = State.initial(CFG)
        while s.winner() is None:
            assert not has_four(s.grid, 1) and not has_four(s.grid, 2)
            s = s.apply(rng.choice(s.legal_actions()))
        w = s.winner()
        if w != DRAW:
            assert has_four(s.grid, w + 1)


def test_encode_is_from_side_to_move_view():
    s = play(3)
    p = s.encode()
    assert p.shape == (3, 6, 7)
    assert p[1, 5, 3] == 1 and p[0].sum() == 0 and p[2].max() == 1  # yellow to move: red piece is "opponent"
    q = s.apply(3).encode()
    assert q[0, 5, 3] == 1 and q[1, 4, 3] == 1 and q[2].max() == 0


def test_mirror_symmetry():
    syms = symmetries(CFG)
    assert len(syms) == 2
    s = play(0, 1, 0)
    mirrored = play(6, 5, 6)
    planes = torch.from_numpy(s.encode()[None])
    pi = torch.zeros(1, 7)
    pi[0, 2] = 1
    new_planes, new_pi = transform_batch(planes, pi, syms[1])
    assert torch.equal(new_planes[0], torch.from_numpy(mirrored.encode()))
    assert new_pi[0, 4] == 1


def test_random_games_terminate():
    rng = np.random.default_rng(0)
    for _ in range(200):
        s = State.initial(CFG)
        while s.winner() is None:
            s = s.apply(rng.choice(s.legal_actions()))
        assert s.ply <= 42


def test_greedy_wins_and_blocks():
    agent = FourRowGreedyAgent(0)
    # red threatens 0-1-2 _ ; yellow (to move) must block column 3
    s = play(0, 6, 1, 6, 2)
    assert s.to_play == 1
    assert agent.act([s])[0] == 3
    # yellow can win in column 6 (three stacked) - takes the win rather than blocking
    s = play(0, 6, 1, 6, 2, 6, 5)
    assert agent.act([s])[0] == 6


def test_lookahead_wins_and_blocks():
    agent = LookaheadAgent(depth=2, seed=0)
    assert agent.act([play(0, 6, 1, 6, 2)])[0] == 3
    assert agent.act([play(0, 6, 1, 6, 2, 6, 5)])[0] == 6


def test_net_shapes():
    preset = get_preset("fourrow")
    net = build_net(preset.game, preset.train).eval()
    spec = spec_of(preset.game)
    x = torch.from_numpy(np.stack([spec.initial().encode()] * 2))
    logits, value = net(x)
    assert logits.shape == (2, 7) and value.shape == (2,)
