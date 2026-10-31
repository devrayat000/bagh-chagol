// Pieces of UI shared by the four-in-a-row menu and game: the top bar, the
// bouncing title and crew-sprite particles. (The rules are in rulebook.ts.)

import { drawFit } from "../art/crew";
import { col, k } from "../engine";
import { share } from "../share";
import { soundOn, toggleSound } from "../sound";
import type { UI } from "../ui";
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

/** Round crew buttons along the top: back on the left; rulebook, sound and share on the right. */
export function drawTopBar(ui: UI, o: TopBarOpts) {
  const s = Math.max(40, Math.min(52, k.width() * 0.06)), m = 14, w = k.width();
  if (o.back) ui.iconButton({ x: m, y: m, w: s, h: s }, o.back.sprite ?? "crew-arrow", o.back.onClick, { tooltip: o.back.tooltip, flip: !o.back.sprite });
  ui.iconButton({ x: w - m - s, y: m, w: s, h: s }, "crew-share", () => void share("Four in a Row", o.shareText, "fourrow"), { tooltip: "Share the game" });
  ui.iconButton({ x: w - m - 2 * s - 10, y: m, w: s, h: s }, "crew-sounds", toggleSound, { tooltip: soundOn ? "Sound: on" : "Sound: off", crossed: !soundOn });
  ui.iconButton({ x: w - m - 3 * s - 20, y: m, w: s, h: s }, "crew-marks_legend", o.onHelp, { tooltip: "Rulebook" });
  return s + m; // height taken
}
