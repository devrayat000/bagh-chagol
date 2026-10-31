// The night scene behind everything: sky, stars, moon, stitched medallions
// and a village silhouette (palms and thatched huts), drawn with kaplay.

import type { Vec2 } from "kaplay";
import { col, k } from "../engine";
import { PALETTE as P } from "./palette";
import { quad, stitchCircle } from "./draw";

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Stars are generated once, in screen fractions, so they don't jump around on resize.
const rand = rng(42);
const STARS = Array.from({ length: 110 }, () => ({ x: rand(), y: rand() * 0.7, r: 0.6 + rand() * 1.4, a: 0.15 + rand() * 0.5, tw: rand() * 6 }));

export function drawScenery(w: number, h: number) {
  const u = Math.min(w, h);
  const t = k.time();

  k.drawRect({ pos: k.vec2(0, 0), width: w, height: h, gradient: [col(P.nightTop), col(P.nightBottom)] });

  for (const s of STARS) {
    const twinkle = 0.7 + 0.3 * Math.sin(t * 1.3 + s.tw);
    k.drawCircle({ pos: k.vec2(s.x * w, s.y * h), radius: s.r, color: col("#fff4dc"), opacity: s.a * twinkle });
  }

  // Moon with a soft halo.
  const moon = k.vec2(w * 0.86, h * 0.16), mr = u * 0.06;
  k.drawCircle({ pos: moon, radius: mr * 6, gradient: [col("#ffe6aa"), col(P.nightTop)], opacity: 0.22 });
  k.drawCircle({ pos: moon, radius: mr, gradient: [col("#fff6dc"), col("#f1d391")] });
  k.drawCircle({ pos: moon.add(mr * 0.3, -mr * 0.15), radius: mr * 0.18, color: col("#e6c47e"), opacity: 0.5 });
  k.drawCircle({ pos: moon.add(-mr * 0.35, mr * 0.3), radius: mr * 0.12, color: col("#e6c47e"), opacity: 0.45 });

  // Faint stitched medallions, like motifs on a kantha quilt.
  medallion(k.vec2(w * 0.08, h * 0.22), u * 0.22, t);
  medallion(k.vec2(w * 0.95, h * 0.72), u * 0.26, -t);

  // Far hills (drawn as thin vertical strips, so the wavy top needs no triangulation).
  const hill = (x: number) => h - h * 0.09 - Math.sin(x / (w * 0.13)) * h * 0.025 - Math.sin(x / (w * 0.05)) * h * 0.008;
  const strips = 48;
  for (let i = 0; i < strips; i++) {
    const x0 = (i / strips) * w, x1 = ((i + 1) / strips) * w;
    k.drawPolygon({ pts: [k.vec2(x0, h), k.vec2(x0, hill(x0)), k.vec2(x1, hill(x1)), k.vec2(x1, h)], color: col("#1d1430") });
  }

  // Near silhouette.
  const dark = "#140d22";
  hut(k.vec2(w * 0.13, h - h * 0.035), u * 0.12, dark);
  hut(k.vec2(w * 0.86, h - h * 0.03), u * 0.1, dark);
  palm(k.vec2(w * 0.04, h), u * 0.38, 0.12, t, dark);
  palm(k.vec2(w * 0.24, h), u * 0.3, -0.08, t + 1, dark);
  palm(k.vec2(w * 0.78, h), u * 0.34, 0.1, t + 2, dark);
  palm(k.vec2(w * 0.93, h), u * 0.42, -0.14, t + 3, dark);
  k.drawRect({ pos: k.vec2(0, h - h * 0.04), width: w, height: h * 0.04, color: col(dark) });
}

function medallion(c: Vec2, r: number, t: number) {
  for (let i = 0; i < 5; i++) {
    stitchCircle(c, r * (0.35 + i * 0.15), Math.max(1, r * 0.012), 24 + i * 8, i % 2 ? P.marigold : P.madder, i % 2 ? 0.07 : 0.1);
  }
  for (let i = 0; i < 12; i++) {
    const a = i * 30 + t * 2; // a very slow turn
    const rad = (a * Math.PI) / 180;
    k.drawEllipse({ pos: c.add(k.vec2(Math.cos(rad), Math.sin(rad)).scale(r * 0.2)), radiusX: r * 0.17, radiusY: r * 0.06, angle: a, color: col(P.marigold), opacity: 0.06 });
  }
}

function palm(base: Vec2, height: number, lean: number, t: number, color: string) {
  const sway = Math.sin(t * 0.6) * height * 0.006;
  const top = base.add(lean * height + sway, -height);
  const trunk = quad(base, base.add(lean * height * 0.2, -height * 0.5), top, 12);
  for (let i = 0; i + 1 < trunk.length; i++) {
    const wdt = height * (0.05 - 0.028 * (i / trunk.length));
    k.drawLine({ p1: trunk[i], p2: trunk[i + 1], width: wdt, color: col(color) });
  }
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i - 3.5) * 0.42 + (i > 3 ? 0.15 : -0.15) + Math.sin(t * 0.9 + i) * 0.03;
    const len = height * (0.3 + (i % 3) * 0.04);
    const end = top.add(Math.cos(a) * len, Math.sin(a) * len * 0.55 + len * 0.35);
    const ctrl = top.add(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5 - len * 0.1);
    const frond = quad(top, ctrl, end, 10);
    for (let j = 0; j + 1 < frond.length; j++) {
      const wdt = len * 0.1 * Math.sin(((j + 0.5) / frond.length) * Math.PI) + 1;
      k.drawLine({ p1: frond[j], p2: frond[j + 1], width: wdt, color: col(color) });
    }
  }
}

function hut(base: Vec2, s: number, color: string) {
  k.drawRect({ pos: base.add(-s * 0.45, -s * 0.45), width: s * 0.9, height: s * 0.45, color: col(color) });
  k.drawPolygon({ pts: [base.add(-s * 0.7, -s * 0.38), base.add(-s * 0.32, -s * 0.62), base.add(0, -s * 0.95), base.add(s * 0.32, -s * 0.62), base.add(s * 0.7, -s * 0.38)], color: col(color) });
  k.drawRect({ pos: base.add(-s * 0.1, -s * 0.3), width: s * 0.2, height: s * 0.3, color: col(P.marigold), opacity: 0.35 + 0.08 * Math.sin(k.time() * 3) }); // lamp-lit doorway
}

/** The title logo "বাঘ-ছাগল" (public/title.png), `height` pixels tall. */
export function drawTitle(pos: Vec2, height: number) {
  const logo = k.getSprite("title")?.data;
  if (!logo) return;
  k.drawSprite({ sprite: "title", pos, anchor: "center", height, width: (logo.width / logo.height) * height });
}
