import numpy as np
import pytest

from bagh.boards import BOARDS, get_board
from bagh.config import GameConfig, get_preset
from bagh.game import DRAW, EMPTY, GOAT, GOAT_SIDE, TIGER, TIGER_SIDE, State
from bagh.solver import Solver
from bagh.symmetry import symmetries


def make(board, tigers, goats, to_play=TIGER_SIDE, k=1, max_plies=50):
    cfg = GameConfig("t", board, tuple(tigers), tuple(goats), k, max_plies)
    s = State.initial(cfg)
    return State(cfg, s.board, to_play, 0, 0)


def P(n, r, c):
    return r * n + c


def H(*labels):
    """Hourglass point numbers (as in the drawing, 1-based) -> indices."""
    return [x - 1 for x in labels]


def act(geo, frm, to):
    return frm * geo.points + to


# ----- square alquerque board ---------------------------------------------------------


def test_adjacency_alquerque():
    g = get_board("alquerque5")
    assert len(g.steps[P(5, 0, 0)]) == 3  # corner: right, down, diagonal
    assert len(g.steps[P(5, 0, 1)]) == 3  # odd point: no diagonals
    assert len(g.steps[P(5, 2, 2)]) == 8  # centre: all directions
    assert len(g.steps[P(5, 1, 2)]) == 4


def test_tiger_jump_captures():
    n, g = 5, get_board("alquerque5")
    s = make("alquerque5", [P(n, 2, 2)], [P(n, 2, 3), P(n, 1, 1)])
    targets = sorted(int(a) % g.points for a in s.legal_actions() if s.is_capture(a))
    assert targets == sorted([P(n, 2, 4), P(n, 0, 0)])
    after = s.apply(act(g, P(n, 2, 2), P(n, 2, 4)))
    assert after.captures == 1
    assert after.board[P(n, 2, 3)] == EMPTY
    assert after.board[P(n, 2, 4)] == TIGER
    assert after.to_play == GOAT_SIDE


def test_no_diagonal_jump_from_odd_point():
    s = make("alquerque5", [P(5, 1, 2)], [P(5, 2, 3)])  # (1,2) has no diagonal lines
    assert not any(s.is_capture(a) for a in s.legal_actions())


def test_blocked_jump():
    s = make("alquerque5", [P(5, 2, 2)], [P(5, 2, 3), P(5, 2, 4)])
    assert act(s.geo, P(5, 2, 2), P(5, 2, 4)) not in s.legal_actions()


def test_tiger_trapped_goats_win():
    s = make("alquerque3", [0], [1, 3, 4, 2, 6, 8])
    assert len(s.legal_actions()) == 0
    assert s.winner() == GOAT_SIDE


def test_capture_target_tiger_wins():
    s = make("alquerque5", [P(5, 2, 2)], [P(5, 2, 3)], k=1)
    s = s.apply(act(s.geo, P(5, 2, 2), P(5, 2, 4)))
    assert s.winner() == TIGER_SIDE


def test_draw_by_ply_limit():
    s = make("alquerque5", [P(5, 2, 2)], [0], max_plies=2)
    s = s.apply(s.legal_actions()[0])
    s = s.apply(s.legal_actions()[0])
    assert s.ply == 2 and s.winner() == DRAW


# ----- hourglass board -------------------------------------------------------------------


def neighbours(g, label):
    return sorted(q + 1 for q in g.steps[label - 1])


def test_hourglass_adjacency():
    g = get_board("hourglass")
    assert g.points == 13
    assert neighbours(g, 7) == [4, 5, 6, 8, 9, 10]
    assert neighbours(g, 2) == [1, 3, 5]
    assert neighbours(g, 1) == [2, 4]
    assert neighbours(g, 5) == [2, 4, 6, 7]
    assert neighbours(g, 12) == [9, 11, 13]


def test_hourglass_jumps():
    g = get_board("hourglass")
    jumps_from = lambda label: sorted((o + 1, t + 1) for o, t in g.jumps[label - 1])  # noqa: E731
    assert jumps_from(9) == [(7, 5)]  # 9 sits in the middle of 8-9-10 and 7-9-12
    assert jumps_from(7) == [(4, 1), (5, 2), (6, 3), (8, 11), (9, 12), (10, 13)]
    assert jumps_from(1) == [(2, 3), (4, 7)]
    assert jumps_from(2) == [(5, 7)]


def test_hourglass_start_position():
    s = State.initial(get_preset("hourglass").game)
    assert s.board[H(9)[0]] == TIGER
    assert all(s.board[p] == GOAT for p in H(1, 2, 3, 4, 5, 6, 7))
    assert s.to_play == GOAT_SIDE  # goats move first on this board
    moves = sorted(divmod(int(a), 13) for a in s.legal_actions())
    assert [(f + 1, t + 1) for f, t in moves] == [(7, 8), (7, 10)]  # every other goat is boxed in
    tiger_view = State(s.cfg, s.board, TIGER_SIDE, 0, 0)
    assert sorted((int(a) % 13) + 1 for a in tiger_view.legal_actions()) == [8, 10, 12]  # 5 blocks the jump


def test_hourglass_capture():
    s = make("hourglass", H(9), H(7))
    capture = act(s.geo, *H(9, 5))
    assert capture in s.legal_actions()
    after = s.apply(capture)
    assert after.captures == 1 and after.board[H(7)[0]] == EMPTY


# ----- general --------------------------------------------------------------------------


def test_random_games_terminate():
    rng = np.random.default_rng(0)
    for name in ("tiny", "hourglass", "small", "full"):
        cfg = get_preset(name).game
        for _ in range(20):
            s = State.initial(cfg)
            while not s.is_terminal():
                s = s.apply(rng.choice(s.legal_actions()))
            assert s.ply <= cfg.max_plies
            assert int((s.board == GOAT).sum()) == len(cfg.goats) - s.captures


@pytest.mark.parametrize("board", list(BOARDS))
def test_symmetries_preserve_rules(board):
    g = get_board(board)
    syms = symmetries(board)
    assert len(syms) == (4 if board == "hourglass" else 8)
    rng = np.random.default_rng(1)
    cfg = GameConfig("t", board, (0,), (), 99, 99)
    point_at_cell = np.full(g.rows * g.cols, -1)
    point_at_cell[g.cell_of] = np.arange(g.points)
    for cell_idx, action_idx in syms:
        old = point_at_cell[cell_idx[g.cell_of]]
        for _ in range(10):
            board_arr = rng.choice([EMPTY, TIGER, GOAT], size=g.points, p=[0.5, 0.2, 0.3]).astype(np.int8)
            for side in (TIGER_SIDE, GOAT_SIDE):
                s = State(cfg, board_arr, side, 0, 0)
                t = State(cfg, board_arr[old], side, 0, 0)
                # Planes of the transformed board == transformed planes.
                planes = s.encode().reshape(7, -1)[:, cell_idx].reshape(s.encode().shape)
                assert np.array_equal(planes, t.encode())
                # Legal moves of the transformed board == transformed legal moves.
                legal = np.zeros(g.num_actions, bool)
                legal[s.legal_actions()] = True
                expected = np.zeros(g.num_actions, bool)
                expected[t.legal_actions()] = True
                assert np.array_equal(legal[action_idx], expected)


def test_solver_matches_brute_force_on_tiny():
    """Retrograde solver must agree with plain depth-limited minimax."""
    cfg = GameConfig("t", "alquerque3", (1,), (6, 7, 8), 1, 12)
    solver = Solver(cfg)
    cache = {}

    def minimax(s):
        key = s.key()
        if key not in cache:
            w = s.winner()
            if w is not None:
                cache[key] = 0 if w == DRAW else (1 if w == s.to_play else -1)
            else:
                cache[key] = max(-minimax(s.apply(a)) for a in s.legal_actions())
        return cache[key]

    minimax(State.initial(cfg))
    for key, v in cache.items():
        assert solver.value(State.from_key(cfg, key)) == v
