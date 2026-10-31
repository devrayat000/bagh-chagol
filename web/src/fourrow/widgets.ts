// Pieces of UI shared by the four-in-a-row menu and game: the top bar, the
// how-to-play dialog, the bouncing title and crew-sprite particles.

import { drawFit } from "../art/crew";
import { col, k } from "../engine";
import { share } from "../share";
import { soundOn, toggleSound } from "../sound";
import { card, text, type UI } from "../ui";
import { FR } from "./art";

// ----- particles made of crew sprites ------------------------------------------------------

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  sprite: string;
  angle: number;
  spin: number;
  gravity: number;
}

export class CrewParticles {
  private list: Sparkle[] = [];

  /** Sprites flying out of (x, y): stars and sparkles when a line is made, hearts for a win. */
  burst(x: number, y: number, unit: number, sprites: string[], count: number, opts: { speed?: number; gravity?: number; life?: number } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = unit * (opts.speed ?? 3) * (0.4 + Math.random());
      const life = (opts.life ?? 0.9) * (0.7 + Math.random() * 0.6);
      this.list.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - unit * (opts.gravity ? 4 : 0),
        life, maxLife: life, size: unit * (0.35 + Math.random() * 0.35), sprite: sprites[i % sprites.length],
        angle: Math.random() * 360, spin: (Math.random() - 0.5) * 540, gravity: (opts.gravity ?? 0) * unit,
      }); // prettier-ignore
    }
  }

  update(dt: number) {
    for (const p of this.list) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - 1.2 * dt;
      p.angle += p.spin * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw() {
    for (const p of this.list) {
      const t = p.life / p.maxLife;
      drawFit(p.sprite, p.x, p.y, p.size * (0.6 + 0.4 * t), { angle: p.angle, opacity: Math.min(1, t * 2.5) });
    }
  }
}

// ----- title -------------------------------------------------------------------------------

/** "FOUR IN A ROW" in the crew's happy font, letters bobbing in red and yellow. */
export function drawTitle(x: number, y: number, size: number, str = "FOUR IN A ROW") {
  const t = k.time();
  k.drawText({
    text: str, font: "happy-o", size, pos: k.vec2(x, y), anchor: "center",
    transform: (i: number) => ({
      pos: k.vec2(0, Math.sin(t * 3 + i * 0.55) * size * 0.08),
      color: col(i % 2 ? FR.yellow : FR.red),
      angle: Math.sin(t * 2 + i) * 4,
    }),
  }); // prettier-ignore
}

// ----- top bar -----------------------------------------------------------------------------

export interface TopBarOpts {
  back?: { tooltip: string; onClick: () => void; sprite?: string }; // default: an arrow pointing left
  onHelp: () => void;
  shareText: string;
}

/** Round crew buttons along the top: back on the left; help, sound and share on the right. */
export function drawTopBar(ui: UI, o: TopBarOpts) {
  const s = Math.max(40, Math.min(52, k.width() * 0.06)), m = 14, w = k.width();
  if (o.back) ui.iconButton({ x: m, y: m, w: s, h: s }, o.back.sprite ?? "crew-arrow", o.back.onClick, { tooltip: o.back.tooltip, flip: !o.back.sprite });
  ui.iconButton({ x: w - m - s, y: m, w: s, h: s }, "crew-share", () => void share("Four in a Row", o.shareText, "fourrow"), { tooltip: "Share the game" });
  ui.iconButton({ x: w - m - 2 * s - 10, y: m, w: s, h: s }, "crew-sounds", toggleSound, { tooltip: soundOn ? "Sound: on" : "Sound: off", crossed: !soundOn });
  ui.iconButton({ x: w - m - 3 * s - 20, y: m, w: s, h: s }, "crew-question_mark", o.onHelp, { tooltip: "How to play" });
  return s + m; // height taken
}

// ----- how to play -------------------------------------------------------------------------

/** A dialog explaining the rules. Returns nothing; call it while the help is open. */
export function drawHelp(ui: UI, open: number, onClose: () => void) {
  const w = k.width(), h = k.height();
  k.drawRect({ pos: k.vec2(0, 0), width: w, height: h, color: col("#0c0a1e"), opacity: 0.5 * open });
  ui.area({ x: 0, y: 0, w, h }, onClose); // click outside to close
  const cw = Math.min(520, w - 32);
  const lines: [string, string][] = [
    ["crew-pointer", "Click a column (or press 1-7) to drop your disc. It falls to the lowest free hole."],
    ["crew-star", "Get four of your discs in a line - across, up and down, or diagonally - to win."],
    ["crew-beenking", "Then the AI drops one. It learned the game by playing against itself (AlphaZero style)."],
    ["crew-history", "Made a mistake? Undo takes back your move and the AI's reply."],
    ["crew-like", "Red always goes first. A full board with no line is a draw."],
  ];
  const icon = 34, tw = cw - 28 - icon - 14 - 24;
  const heights = lines.map(([, line]) => Math.max(50, k.formatText({ text: line, size: 16, font: "ui", width: tw, lineSpacing: -2 }).height + 16));
  const ch = Math.min(h - 32, 100 + heights.reduce((a, b) => a + b, 0));
  const e = k.easings.easeOutBack(open);
  const R = { x: (w - cw) / 2, y: (h - ch) / 2 + (1 - e) * 30, w: cw, h: ch };
  ui.area(R, () => {}); // clicks on the card itself don't close it
  card(R, { opacity: 0.98 * open, color: "#fffaf0", edge: FR.boardEdge, radius: 24 });
  drawTitle(w / 2, R.y + 46, Math.min(40, cw * 0.08), "HOW TO PLAY");
  let y = R.y + 92;
  const tx = R.x + 28 + icon + 14;
  lines.forEach(([sprite, line], i) => {
    drawFit(sprite, R.x + 28 + icon / 2, y + 16, icon, { opacity: open, frame: Math.floor(k.time() * 20) });
    text(line, tx, y, { size: 16, color: FR.ink, width: tw, opacity: open, lineSpacing: -2 });
    y += heights[i];
  });
  const s = 44;
  ui.iconButton({ x: R.x + R.w - s - 12, y: R.y + 12, w: s, h: s }, "crew-cross_mark", onClose, { tooltip: "Close" });
}
