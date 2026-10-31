"""Play বাঘ-ছাগল against an agent in a pygame window.

Controls: click one of your pieces, then click where it should go.
  U undo (takes back your last move and the AI's reply)   R restart
  S switch sides                                           +/- AI search strength
"""

from __future__ import annotations

import threading
from pathlib import Path

import pygame

from .config import GameConfig, get_preset
from .game import DRAW, GOAT, SIDE_NAMES, TIGER, TIGER_SIDE, State, point_name

WIDTH, HEIGHT = 680, 820
BOARD_TOP, MARGIN = 135, 90
BG = (150, 190, 150)
BOARD_FILL = (205, 236, 205)
LINE = (25, 25, 25)
TIGER_ORANGE, TIGER_DARK = (245, 150, 30), (40, 30, 20)
GOAT_BROWN, GOAT_LIGHT, GOAT_HORN = (150, 108, 78), (225, 200, 170), (90, 80, 70)
SELECT, MOVE_DOT, CAPTURE_DOT, LAST_MOVE = (255, 255, 255), (30, 140, 60), (210, 40, 40), (250, 220, 60)
TEXT = (20, 30, 20)


def make_agent(preset: str, opponent: str, sims: int, checkpoint: Path | None):
    game = get_preset(preset).game
    if opponent == "random":
        from .baselines import RandomAgent

        return RandomAgent(), "random"
    if opponent == "greedy":
        from .baselines import GreedyAgent

        return GreedyAgent(), "greedy"
    if opponent == "solver":
        from .solver import SolverAgent

        return SolverAgent(game), "perfect solver"

    from .mcts import MCTS, MCTSAgent
    from .net import NetEvaluator, UniformEvaluator, default_device, load_checkpoint

    if opponent == "mcts":
        return MCTSAgent(MCTS(UniformEvaluator(), sims)), f"plain MCTS ({sims} sims)"
    path = checkpoint or Path("checkpoints") / preset / "best.pt"
    if not path.exists():
        raise SystemExit(f"{path} not found - train first:  uv run main.py train --preset {preset}")
    device = default_device()
    net, ckpt = load_checkpoint(path, device)
    if ckpt["board"] != game.board:
        raise SystemExit(f"{path} was trained on board {ckpt['board']!r}, preset {preset!r} uses {game.board!r}")
    return MCTSAgent(MCTS(NetEvaluator(net, device), sims)), f"network it{ckpt['iteration']} + MCTS"


class App:
    def __init__(self, cfg: GameConfig, agent, agent_label: str, human_side: int):
        self.cfg, self.agent, self.agent_label = cfg, agent, agent_label
        self.human_side = human_side
        geo = State.initial(cfg).geo
        self.step = (WIDTH - 2 * MARGIN) / (max(geo.rows, geo.cols) - 1)
        self.radius = max(14, min(34, int(self.step * 0.3)))
        self.font = pygame.font.SysFont("segoeui,arial", 22)
        self.small = pygame.font.SysFont("segoeui,arial", 17)
        self.big = pygame.font.SysFont("segoeui,arial", 34, bold=True)
        self.thinking_lock = threading.Lock()
        self.restart()

    # ----- game flow ---------------------------------------------------------------

    def restart(self):
        self.state = State.initial(self.cfg)
        self.history: list[State] = []
        self.last_move: int | None = None
        self.selected: int | None = None
        self.generation = getattr(self, "generation", 0) + 1  # invalidates any AI search in progress
        self.ai_result = None
        self.ai_busy = False
        self.ai_eval: float | None = None

    def human_turn(self) -> bool:
        return not self.state.is_terminal() and self.state.to_play == self.human_side

    def play(self, action: int):
        self.history.append(self.state)
        self.state = self.state.apply(action)
        self.last_move = action
        self.selected = None

    def undo(self):
        # Go back to the previous position where it was the human's turn.
        while self.history:
            self.state = self.history.pop()
            if self.state.to_play == self.human_side:
                break
        self.last_move = None
        self.selected = None
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
        if self.ai_result is None:
            return
        gen, action, value = self.ai_result
        self.ai_result = None
        if gen == self.generation:
            self.ai_busy = False
            self.ai_eval = value
            self.play(action)

    def click(self, pos):
        if not self.human_turn():
            return
        p = self.point_at(pos)
        if p is None:
            return
        own = TIGER if self.human_side == TIGER_SIDE else GOAT
        if self.state.board[p] == own:
            self.selected = p
        elif self.selected is not None:
            action = self.selected * self.state.geo.points + p
            if action in self.state.legal_actions():
                self.play(action)

    # ----- drawing -------------------------------------------------------------------

    def xy(self, p: int) -> tuple[int, int]:
        r, c = self.state.geo.rc(p)
        return int(MARGIN + c * self.step), int(BOARD_TOP + r * self.step)

    def point_at(self, pos) -> int | None:
        for p in range(self.state.geo.points):
            x, y = self.xy(p)
            if (x - pos[0]) ** 2 + (y - pos[1]) ** 2 <= (self.radius + 6) ** 2:
                return p
        return None

    def draw(self, screen: pygame.Surface):
        screen.fill(BG)
        geo = self.state.geo
        for polygon in geo.shading:
            pygame.draw.polygon(screen, BOARD_FILL, [self.xy(p) for p in polygon])
        for p, q in geo.edges:
            pygame.draw.line(screen, LINE, self.xy(p), self.xy(q), 3)
        for p in range(geo.points):
            pygame.draw.circle(screen, LINE, self.xy(p), 5)
        if geo.grid_labels:  # a1 = bottom-left, like chess
            for p, (r, c) in enumerate(geo.coords):
                x, y = self.xy(p)
                if r == geo.rows - 1:
                    self.blit_center(screen, self.small, geo.labels[p][0], (x, y + self.radius + 22))
                if c == 0:
                    self.blit_center(screen, self.small, geo.labels[p][1:], (x - self.radius - 22, y))
        else:  # numbered points, like the drawing
            for p in range(geo.points):
                x, y = self.xy(p)
                self.blit_center(screen, self.small, geo.labels[p], (x - self.radius - 6, y - self.radius - 4))

        if self.last_move is not None:
            f, t = divmod(self.last_move, geo.points)
            pygame.draw.line(screen, LAST_MOVE, self.xy(f), self.xy(t), 6)

        for p in range(geo.points):
            if self.state.board[p] == TIGER:
                self.draw_tiger(screen, self.xy(p))
            elif self.state.board[p] == GOAT:
                self.draw_goat(screen, self.xy(p))

        if self.selected is not None:
            pygame.draw.circle(screen, SELECT, self.xy(self.selected), self.radius + 5, 4)
            for a in self.state.legal_actions():
                f, t = divmod(int(a), geo.points)
                if f == self.selected:
                    color = CAPTURE_DOT if self.state.is_capture(a) else MOVE_DOT
                    pygame.draw.circle(screen, color, self.xy(t), max(7, self.radius // 3))

        self.draw_status(screen)

    def draw_tiger(self, screen, center):
        x, y = center
        r = self.radius
        for ex in (-0.65, 0.65):  # ears
            pygame.draw.circle(screen, TIGER_ORANGE, (x + int(ex * r), y - int(0.75 * r)), r // 3)
            pygame.draw.circle(screen, TIGER_DARK, (x + int(ex * r), y - int(0.75 * r)), r // 3, 2)
        pygame.draw.circle(screen, TIGER_ORANGE, center, r)
        for dx in (-0.45, 0.0, 0.45):  # stripes
            pygame.draw.line(screen, TIGER_DARK, (x + int(dx * r), y - int(0.95 * r)),
                             (x + int(dx * r * 0.6), y - int(0.5 * r)), 3)  # fmt: skip
        for side in (-1, 1):
            pygame.draw.line(screen, TIGER_DARK, (x + side * r, y + int(0.1 * r)),
                             (x + side * int(0.55 * r), y + int(0.2 * r)), 3)  # fmt: skip
            pygame.draw.circle(screen, TIGER_DARK, (x + side * int(0.35 * r), y - int(0.1 * r)), max(2, r // 9))
        pygame.draw.circle(screen, (250, 240, 225), (x, y + int(0.45 * r)), int(0.32 * r))  # muzzle
        pygame.draw.circle(screen, TIGER_DARK, (x, y + int(0.33 * r)), max(2, r // 8))
        pygame.draw.circle(screen, TIGER_DARK, center, r, 2)

    def draw_goat(self, screen, center):
        x, y = center
        r = self.radius
        for side in (-1, 1):  # horns
            pygame.draw.line(screen, GOAT_HORN, (x + side * int(0.35 * r), y - int(0.7 * r)),
                             (x + side * int(0.75 * r), y - int(1.25 * r)), max(3, r // 6))  # fmt: skip
        pygame.draw.circle(screen, GOAT_BROWN, center, r)
        pygame.draw.ellipse(screen, GOAT_LIGHT, (x - int(0.4 * r), y - int(0.2 * r), int(0.8 * r), int(1.1 * r)))
        for side in (-1, 1):
            pygame.draw.circle(screen, TIGER_DARK, (x + side * int(0.4 * r), y - int(0.25 * r)), max(2, r // 9))
        pygame.draw.circle(screen, TIGER_DARK, center, r, 2)

    def draw_status(self, screen):
        s = self.state
        human, ai = SIDE_NAMES[self.human_side], SIDE_NAMES[1 - self.human_side]
        self.blit_center(screen, self.font, f"You: {human}    AI: {ai} ({self.agent_label})", (WIDTH // 2, 30))
        self.blit_center(screen, self.small, f"goats captured {s.captures}/{self.cfg.captures_to_win}    "
                                             f"move {s.ply}/{self.cfg.max_plies} (then draw)", (WIDTH // 2, 58))  # fmt: skip

        w = s.winner()
        if w is not None:
            msg = "Draw!" if w == DRAW else ("You win!" if w == self.human_side else "AI wins!")
            reason = {DRAW: "move limit reached"}.get(w) or (
                "goats captured" if s.captures >= self.cfg.captures_to_win else f"{SIDE_NAMES[1 - w]} cannot move"
            )
            self.blit_center(screen, self.big, msg, (WIDTH // 2, HEIGHT - 120))
            self.blit_center(screen, self.small, f"({reason})  press R to play again", (WIDTH // 2, HEIGHT - 88))
        elif self.human_turn():
            self.blit_center(screen, self.font, "Your move", (WIDTH // 2, HEIGHT - 115))
        else:
            self.blit_center(screen, self.font, "AI is thinking...", (WIDTH // 2, HEIGHT - 115))
        if self.ai_eval is not None:
            mood = "winning" if self.ai_eval > 0.3 else "losing" if self.ai_eval < -0.3 else "about even"
            self.blit_center(screen, self.small, f"AI's evaluation of its last move: {self.ai_eval:+.2f} ({mood})",
                             (WIDTH // 2, HEIGHT - 60))  # fmt: skip
        sims = getattr(getattr(self.agent, "mcts", None), "sims", None)
        help_text = "U undo   R restart   S switch sides" + (f"   +/- AI strength ({sims} sims)" if sims else "")
        self.blit_center(screen, self.small, help_text, (WIDTH // 2, HEIGHT - 28))
        if self.last_move is not None and self.history:
            prev = self.history[-1]
            f, t = divmod(self.last_move, prev.geo.points)
            sep = "x" if prev.is_capture(self.last_move) else "-"
            self.blit_center(screen, self.small, f"last: {SIDE_NAMES[prev.to_play]} "
                             f"{point_name(prev.geo, f)}{sep}{point_name(prev.geo, t)}", (WIDTH // 2, HEIGHT - 150))  # fmt: skip

    @staticmethod
    def blit_center(screen, font, text, center):
        img = font.render(text, True, TEXT)
        screen.blit(img, img.get_rect(center=center))


def run(preset: str, opponent: str, side: str, sims: int, checkpoint: Path | None) -> None:
    cfg = get_preset(preset).game
    agent, label = make_agent(preset, opponent, sims, checkpoint)
    pygame.init()
    pygame.display.set_caption(f"বাঘ-ছাগল  Bagh-Chagol  ({preset})")
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    app = App(cfg, agent, label, TIGER_SIDE if side == "tiger" else 1 - TIGER_SIDE)
    clock = pygame.time.Clock()
    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT or (event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE):
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                app.click(event.pos)
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_r:
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
        clock.tick(30)
    pygame.quit()
