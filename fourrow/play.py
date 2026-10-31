"""Play four-in-a-row against an agent in a pygame window.

Controls: click a column (or press 1-7) to drop your piece.
  U undo (takes back your last move and the AI's reply)   R restart
  S switch sides                                           +/- AI search strength
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

import pygame

from core.spec import DRAW

from .config import FourRowConfig, get_preset
from .game import SIDE_NAMES, State

CELL = 90  # pixels per board cell
MARGIN = 40
BOARD_TOP = 150  # the row above the board shows the piece you are about to drop
BG = (226, 232, 240)
BOARD_BLUE, BOARD_EDGE = (30, 80, 200), (15, 45, 130)
PIECE = {0: ((220, 40, 40), (150, 20, 20)), 1: ((250, 205, 40), (185, 140, 10))}  # side -> (fill, rim)
WIN_RING, LAST_DOT = (255, 255, 255), (255, 255, 255)
HOLE_KEY = (255, 0, 255)  # transparent colour of the holes in the board surface
TEXT = (20, 30, 50)
DROP_SPEED = 2600  # pixels / s^2: pieces fall with gravity


def make_agent(preset: str, opponent: str, sims: int, checkpoint: Path | None):
    if opponent == "random":
        from core.baselines import RandomAgent

        return RandomAgent(), "random"
    if opponent == "greedy":
        from .agents import FourRowGreedyAgent

        return FourRowGreedyAgent(), "greedy"
    if opponent == "lookahead":
        from .agents import LookaheadAgent

        return LookaheadAgent(depth=4), "alpha-beta depth 4"

    from core.mcts import MCTS, MCTSAgent
    from core.net import NetEvaluator, UniformEvaluator, default_device, load_checkpoint

    if opponent == "mcts":
        return MCTSAgent(MCTS(UniformEvaluator(), sims)), f"plain MCTS ({sims} sims)"
    path = checkpoint or Path("checkpoints") / preset / "best.pt"
    if not path.exists():
        raise SystemExit(f"{path} not found - train first:  uv run main.py train --preset {preset}")
    device = default_device()
    net, ckpt = load_checkpoint(path, device)
    return MCTSAgent(MCTS(NetEvaluator(net, device), sims)), f"network it{ckpt['iteration']} + MCTS"


class App:
    def __init__(self, cfg: FourRowConfig, agent, agent_label: str, human_side: int):
        self.cfg, self.agent, self.agent_label = cfg, agent, agent_label
        self.human_side = human_side
        self.width = 2 * MARGIN + cfg.cols * CELL
        self.height = BOARD_TOP + cfg.rows * CELL + 170
        self.radius = int(CELL * 0.4)
        self.font = pygame.font.SysFont("segoeui,arial", 22)
        self.small = pygame.font.SysFont("segoeui,arial", 17)
        self.big = pygame.font.SysFont("segoeui,arial", 34, bold=True)
        self.board_surface = self.make_board_surface()
        self.thinking_lock = threading.Lock()
        self.restart()

    # ----- game flow ---------------------------------------------------------------

    def restart(self):
        self.state = State.initial(self.cfg)
        self.history: list[State] = []
        self.drop_start: float | None = None  # when the last piece started falling
        self.generation = getattr(self, "generation", 0) + 1  # invalidates any AI search in progress
        self.ai_result = None
        self.ai_busy = False
        self.ai_eval: float | None = None

    def human_turn(self) -> bool:
        return not self.state.is_terminal() and self.state.to_play == self.human_side

    def play(self, col: int):
        self.history.append(self.state)
        self.state = self.state.apply(col)
        self.drop_start = time.perf_counter()

    def undo(self):
        # Go back to the previous position where it was the human's turn.
        while self.history:
            self.state = self.history.pop()
            if self.state.to_play == self.human_side:
                break
        self.drop_start = None
        self.generation += 1
        self.ai_busy = False

    def maybe_start_ai(self):
        if self.state.is_terminal() or self.human_turn() or self.ai_busy:
            return
        self.ai_busy = True
        gen, state = self.generation, self.state

        def work():
            with self.thinking_lock:  # agents are not thread-safe; one search at a time
                action = self.agent.act([state])[0]
                value = getattr(self.agent, "last_value", None)
            self.ai_result = (gen, action, value)

        threading.Thread(target=work, daemon=True).start()

    def collect_ai(self):
        if self.ai_result is None or self.falling():  # let the human's piece land first
            return
        gen, action, value = self.ai_result
        self.ai_result = None
        if gen == self.generation:
            self.ai_busy = False
            self.ai_eval = value
            self.play(action)

    def try_drop(self, col: int | None):
        if col is not None and self.human_turn() and not self.falling() and col in self.state.legal_actions():
            self.play(col)

    # ----- geometry ------------------------------------------------------------------

    def center(self, row: int, col: int) -> tuple[int, int]:
        return MARGIN + col * CELL + CELL // 2, BOARD_TOP + row * CELL + CELL // 2

    def column_at(self, x: int) -> int | None:
        col = (x - MARGIN) // CELL
        return int(col) if 0 <= col < self.cfg.cols else None

    def fall_y(self) -> float | None:
        """Current height of the falling last piece, or None when it has landed."""
        if self.drop_start is None or self.state.last is None:
            return None
        row, col = self.state.last
        start_y = BOARD_TOP - CELL // 2
        target_y = self.center(row, col)[1]
        t = time.perf_counter() - self.drop_start
        y = start_y + 0.5 * DROP_SPEED * t * t
        if y >= target_y:
            self.drop_start = None
            return None
        return y

    def falling(self) -> bool:
        return self.fall_y() is not None

    # ----- drawing -------------------------------------------------------------------

    def make_board_surface(self) -> pygame.Surface:
        w, h = self.cfg.cols * CELL, self.cfg.rows * CELL
        surf = pygame.Surface((w + 16, h + 16))
        surf.fill(HOLE_KEY)
        pygame.draw.rect(surf, BOARD_BLUE, surf.get_rect(), border_radius=18)
        pygame.draw.rect(surf, BOARD_EDGE, surf.get_rect(), 4, border_radius=18)
        for r in range(self.cfg.rows):
            for c in range(self.cfg.cols):
                x, y = 8 + c * CELL + CELL // 2, 8 + r * CELL + CELL // 2
                pygame.draw.circle(surf, BOARD_EDGE, (x, y), self.radius + 3)
                pygame.draw.circle(surf, HOLE_KEY, (x, y), self.radius)
        surf.set_colorkey(HOLE_KEY)
        return surf

    def draw_piece(self, screen, side: int, center, alpha: int = 255):
        fill, rim = PIECE[side]
        r = self.radius
        piece = pygame.Surface((2 * r + 2, 2 * r + 2), pygame.SRCALPHA)
        c = (r + 1, r + 1)
        pygame.draw.circle(piece, rim, c, r)
        pygame.draw.circle(piece, fill, c, int(r * 0.82))
        pygame.draw.circle(piece, rim, c, int(r * 0.62), 2)  # the moulded ring of a real piece
        piece.set_alpha(alpha)
        screen.blit(piece, piece.get_rect(center=(int(center[0]), int(center[1]))))

    def draw(self, screen: pygame.Surface):
        screen.fill(BG)
        s = self.state
        fall_y = self.fall_y()

        # Pieces go BEHIND the board surface, so they show through the holes.
        for r in range(self.cfg.rows):
            for c in range(self.cfg.cols):
                v = int(s.grid[r, c])
                if not v:
                    continue
                x, y = self.center(r, c)
                if fall_y is not None and (r, c) == s.last:
                    y = fall_y
                self.draw_piece(screen, v - 1, (x, y))
        screen.blit(self.board_surface, (MARGIN - 8, BOARD_TOP - 8))

        if fall_y is None:
            w = s.winner()
            if w is not None and w != DRAW:
                for r, c in s.winning_cells():
                    pygame.draw.circle(screen, WIN_RING, self.center(r, c), self.radius + 2, 5)
            elif s.last is not None:
                pygame.draw.circle(screen, LAST_DOT, self.center(*s.last), 6)

        # The piece you are about to drop, above the column under the mouse.
        if self.human_turn() and fall_y is None:
            col = self.column_at(pygame.mouse.get_pos()[0])
            if col is not None and col in s.legal_actions():
                self.draw_piece(screen, self.human_side, (self.center(0, col)[0], BOARD_TOP - CELL // 2 - 4), 170)

        board_bottom = BOARD_TOP + self.cfg.rows * CELL
        for c in range(self.cfg.cols):
            self.blit_center(screen, self.small, str(c + 1), (self.center(0, c)[0], board_bottom + 22))
        self.draw_status(screen, board_bottom)

    def draw_status(self, screen, board_bottom: int):
        s, mid = self.state, self.width // 2
        human, ai = SIDE_NAMES[self.human_side], SIDE_NAMES[1 - self.human_side]
        self.blit_center(screen, self.font, f"You: {human}    AI: {ai} ({self.agent_label})", (mid, 26))
        self.blit_center(screen, self.small, f"move {s.ply}/{self.cfg.rows * self.cfg.cols}    "
                                             f"{SIDE_NAMES[0]} moves first", (mid, 54))  # fmt: skip

        y = board_bottom + 62
        w = s.winner()
        if w is not None and not self.falling():
            msg = "Draw!" if w == DRAW else ("You win!" if w == self.human_side else "AI wins!")
            self.blit_center(screen, self.big, msg, (mid, y))
            self.blit_center(screen, self.small, "press R to play again", (mid, y + 32))
        elif w is None and self.human_turn():
            self.blit_center(screen, self.font, "Your move", (mid, y))
        elif w is None:
            self.blit_center(screen, self.font, "AI is thinking...", (mid, y))
        if self.ai_eval is not None and w is None:
            mood = "winning" if self.ai_eval > 0.3 else "losing" if self.ai_eval < -0.3 else "about even"
            self.blit_center(screen, self.small, f"AI's evaluation of its last move: {self.ai_eval:+.2f} ({mood})",
                             (mid, y + 32))  # fmt: skip
        sims = getattr(getattr(self.agent, "mcts", None), "sims", None)
        help_text = "U undo   R restart   S switch sides" + (f"   +/- AI strength ({sims} sims)" if sims else "")
        self.blit_center(screen, self.small, help_text, (mid, self.height - 24))

    @staticmethod
    def blit_center(screen, font, text, center):
        img = font.render(text, True, TEXT)
        screen.blit(img, img.get_rect(center=(int(center[0]), int(center[1]))))


def run(preset: str, opponent: str, side: str, sims: int, checkpoint: Path | None) -> None:
    cfg = get_preset(preset).game
    agent, label = make_agent(preset, opponent, sims, checkpoint)
    pygame.init()
    pygame.display.set_caption(f"Four in a row  ({preset})")
    app = App(cfg, agent, label, SIDE_NAMES.index(side))
    screen = pygame.display.set_mode((app.width, app.height))
    clock = pygame.time.Clock()
    number_keys = {getattr(pygame, f"K_{i + 1}"): i for i in range(min(cfg.cols, 9))}
    number_keys |= {getattr(pygame, f"K_KP{i + 1}"): i for i in range(min(cfg.cols, 9))}
    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT or (event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE):
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                app.try_drop(app.column_at(event.pos[0]))
            elif event.type == pygame.KEYDOWN:
                if event.key in number_keys:
                    app.try_drop(number_keys[event.key])
                elif event.key == pygame.K_r:
                    app.restart()
                elif event.key == pygame.K_u:
                    app.undo()
                elif event.key == pygame.K_s:
                    app.human_side = 1 - app.human_side
                    app.restart()
                elif event.key in (pygame.K_PLUS, pygame.K_EQUALS, pygame.K_KP_PLUS, pygame.K_MINUS, pygame.K_KP_MINUS):
                    mcts = getattr(app.agent, "mcts", None)
                    if mcts is not None:
                        up = event.key in (pygame.K_PLUS, pygame.K_EQUALS, pygame.K_KP_PLUS)
                        mcts.sims = min(3200, mcts.sims * 2) if up else max(10, mcts.sims // 2)
        app.collect_ai()
        app.maybe_start_ai()
        app.draw(screen)
        pygame.display.flip()
        clock.tick(60)
    pygame.quit()
