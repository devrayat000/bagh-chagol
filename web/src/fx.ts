// Particles: fireflies drifting in the night, tufts of fur when a goat is
// captured, and confetti for a win.

import { col, k } from "./engine";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: "tuft" | "spark" | "confetti" | "ring";
  angle: number;
  spin: number;
}

export class Particles {
  private list: Particle[] = [];

  burst(x: number, y: number, unit: number, kind: "tuft" | "spark" | "confetti", count: number, colors: string[]) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = unit * (kind === "confetti" ? 4 + Math.random() * 6 : 1.2 + Math.random() * 2.8);
      const life = kind === "confetti" ? 2.2 + Math.random() * 1.5 : 0.5 + Math.random() * 0.6;
      this.list.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - (kind === "confetti" ? unit * 5 : 0),
        life, maxLife: life,
        size: unit * (kind === "tuft" ? 0.12 + Math.random() * 0.14 : kind === "confetti" ? 0.16 : 0.06),
        color: colors[i % colors.length],
        kind,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 12,
      }); // prettier-ignore
    }
  }

  ring(x: number, y: number, size: number, color: string) {
    this.list.push({ x, y, vx: 0, vy: 0, life: 0.45, maxLife: 0.45, size, color, kind: "ring", angle: 0, spin: 0 });
  }

  get active() {
    return this.list.length > 0;
  }

  update(dt: number, unit: number) {
    for (const p of this.list) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      if (p.kind === "confetti") {
        p.vy += unit * 9 * dt; // gravity
        p.vx *= 1 - 1.5 * dt;
      } else {
        p.vx *= 1 - 3 * dt;
        p.vy *= 1 - 3 * dt;
      }
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw() {
    for (const p of this.list) {
      const t = p.life / p.maxLife; // 1 -> 0
      if (p.kind === "ring") {
        k.drawCircle({ pos: k.vec2(p.x, p.y), radius: p.size * (1.6 - t * 0.6), fill: false,
                       outline: { width: p.size * 0.12 * t + 1, color: col(p.color) }, opacity: t }); // prettier-ignore
      } else if (p.kind === "confetti") {
        k.drawRect({ pos: k.vec2(p.x, p.y), width: p.size, height: p.size * 0.5 * Math.abs(Math.cos(p.angle)) + 1,
                     angle: (p.angle * 180) / Math.PI, anchor: "center", color: col(p.color), opacity: Math.min(1, t * 3) }); // prettier-ignore
      } else {
        k.drawCircle({ pos: k.vec2(p.x, p.y), radius: p.size * (0.5 + t * 0.5), color: col(p.color), opacity: t * 0.9 });
      }
    }
  }
}

/** Slow-drifting fireflies; positions are fractions of the screen so they survive resizes. */
export class Fireflies {
  private flies = Array.from({ length: 26 }, () => ({
    x: Math.random(),
    y: 0.25 + Math.random() * 0.75,
    phase: Math.random() * Math.PI * 2,
    speed: 0.3 + Math.random() * 0.7,
  }));

  draw(w: number, h: number) {
    const t = k.time();
    const u = Math.min(w, h);
    for (const f of this.flies) {
      const x = (f.x + Math.sin(t * 0.07 * f.speed + f.phase) * 0.05) * w;
      const y = (f.y + Math.cos(t * 0.11 * f.speed + f.phase * 1.3) * 0.04) * h;
      const glow = 0.5 + 0.5 * Math.sin(t * 2.2 * f.speed + f.phase);
      k.drawCircle({ pos: k.vec2(x, y), radius: u * 0.012, color: col("#ffd56b"), opacity: 0.08 * glow });
      k.drawCircle({ pos: k.vec2(x, y), radius: u * 0.0025 + 1, color: col("#fff2b0"), opacity: 0.25 + 0.6 * glow });
    }
  }
}
