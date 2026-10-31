// Small drawing helpers on top of kaplay's draw functions.

import type { Vec2 } from "kaplay";
import { col, k } from "../engine";

/** A line sewn as running stitches: short dashes with gaps. */
export function stitchLine(a: Vec2, b: Vec2, width: number, dash: number, gap: number, color: string, opacity = 1, offset = 0) {
  const len = a.dist(b);
  if (len < 1e-6) return;
  const dir = b.sub(a).scale(1 / len);
  for (let t = offset % (dash + gap); t < len; t += dash + gap) {
    const t2 = Math.min(len, t + dash);
    if (t2 <= Math.max(0, t)) continue;
    k.drawLine({ p1: a.add(dir.scale(Math.max(0, t))), p2: a.add(dir.scale(t2)), width, color: col(color), opacity });
  }
}

/** Stitches along a polyline, continuing the dash pattern across corners. */
export function stitchPolyline(pts: Vec2[], width: number, dash: number, gap: number, color: string, opacity = 1) {
  let offset = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    stitchLine(pts[i], pts[i + 1], width, dash, gap, color, opacity, offset);
    offset -= pts[i].dist(pts[i + 1]);
    offset = ((offset % (dash + gap)) + dash + gap) % (dash + gap);
  }
}

/** A circle sewn in running stitches. */
export function stitchCircle(c: Vec2, r: number, width: number, segments: number, color: string, opacity = 1) {
  for (let i = 0; i < segments; i++) {
    const a1 = (i / segments) * Math.PI * 2, a2 = ((i + 0.6) / segments) * Math.PI * 2;
    k.drawLine({
      p1: c.add(k.vec2(Math.cos(a1), Math.sin(a1)).scale(r)),
      p2: c.add(k.vec2(Math.cos(a2), Math.sin(a2)).scale(r)),
      width, color: col(color), opacity,
    }); // prettier-ignore
  }
}

/** An embroidered flower: `n` petals around a coloured centre. */
export function rosette(c: Vec2, r: number, petal: string, centre: string, n = 8, opacity = 1) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360;
    const rad = (a * Math.PI) / 180;
    k.drawEllipse({
      pos: c.add(k.vec2(Math.cos(rad), Math.sin(rad)).scale(r * 0.55)),
      radiusX: r * 0.45, radiusY: r * 0.19, angle: a, color: col(petal), opacity,
    }); // prettier-ignore
  }
  k.drawCircle({ pos: c, radius: r * 0.36, color: col("#5a2a12"), opacity: 0.35 * opacity });
  k.drawCircle({ pos: c, radius: r * 0.3, color: col(centre), opacity });
}

/** Points along a quadratic Bézier curve. */
export function quad(p0: Vec2, p1: Vec2, p2: Vec2, steps = 10): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push(p0.scale(u * u).add(p1.scale(2 * u * t)).add(p2.scale(t * t)));
  }
  return pts;
}
