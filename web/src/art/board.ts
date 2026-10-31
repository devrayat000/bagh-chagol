// The board, drawn with kaplay in the style of a nakshi kantha: cream cloth
// with rows of fine running stitches, the playing lines sewn in madder red,
// embroidered rosettes on the points and a stitched sawtooth border.

import type { Vec2 } from "kaplay";
import type { BoardDef } from "../rules";
import { col, k } from "../engine";
import { PALETTE as P } from "./palette";
import { rosette, stitchLine, stitchPolyline } from "./draw";

export const BOARD_PAD = 0.13; // margin between the cloth edge and the outermost points (fraction of size)

/** Position of point p in the board square, as fractions (0..1) of its size. */
export function pointUV(def: BoardDef, p: number): [number, number] {
  const [r, c] = def.coords[p];
  const n = Math.max(def.rows, def.cols) - 1;
  const span = 1 - 2 * BOARD_PAD;
  return [BOARD_PAD + (c * span) / n, BOARD_PAD + (r * span) / n];
}

/** Distance between neighbouring grid cells, as a fraction of the board size. */
export function cellSize(def: BoardDef): number {
  return (1 - 2 * BOARD_PAD) / (Math.max(def.rows, def.cols) - 1);
}

/** Radius of a piece, as a fraction of the board size. */
export function pieceRadius(def: BoardDef): number {
  return Math.min(cellSize(def) * 0.33, 0.08);
}

export interface BoardDrawOpts {
  labels?: boolean;
  detail?: boolean; // the background stitch rows (skipped for small previews)
}

/** Draw the board with its top-left corner at `o` and side length `S` (screen pixels). */
export function drawBoard(def: BoardDef, o: Vec2, S: number, opts: BoardDrawOpts = {}) {
  const at = (u: number, v: number) => o.add(k.vec2(u * S, v * S));
  const pt = (p: number) => at(...pointUV(def, p));
  const radius = S * 0.045;

  // --- cloth -------------------------------------------------------------------------
  k.drawRect({ pos: at(0.012, 0.03), width: S * 0.976, height: S * 0.976, radius, color: col("#000000"), opacity: 0.35 });
  k.drawRect({ pos: at(0.012, 0.012), width: S * 0.976, height: S * 0.976, radius, color: col(P.clothDark) });
  k.drawRect({ pos: at(0.03, 0.03), width: S * 0.94, height: S * 0.94, radius: radius * 0.7, color: col(P.clothLight) }); // worn, lighter middle

  // Kantha fill: rows of tiny running stitches inside the border.
  if (opts.detail !== false) {
    const gapRow = 0.03;
    for (let v = 0.09, row = 0; v < 0.92; v += gapRow, row++) {
      stitchLine(at(0.085, v), at(0.915, v), Math.max(1, S * 0.0022), S * 0.012, S * 0.008, "#8c6030", 0.13, row % 2 ? S * 0.01 : 0);
    }
  }

  // --- border: two stitched frames with a sawtooth band between ------------------------
  const b1 = 0.035, b2 = 0.068, mid = (b1 + b2) / 2;
  stitchedFrame(at, S, b1, P.madder, S * 0.0055, S * 0.016, S * 0.009);
  stitchedFrame(at, S, b2, P.indigo, S * 0.0045, S * 0.012, S * 0.008);
  sawtooth(at, mid, (b2 - b1) * 0.55);
  for (const [u, v] of [[mid, mid], [1 - mid, mid], [mid, 1 - mid], [1 - mid, 1 - mid]]) {
    k.drawCircle({ pos: at(u, v), radius: S * (b2 - b1) * 0.62, color: col(P.clothLight) });
    rosette(at(u, v), S * (b2 - b1) * 0.58, P.madder, P.marigold);
  }

  // --- shaded regions (e.g. the hourglass triangles): a wash plus diagonal stitching ---
  for (const poly of def.shading) {
    const pts = poly.map(pt);
    k.drawPolygon({ pts, color: col(P.indigo), opacity: 0.07 });
    k.drawMasked(
      () => {
        for (let d = -1; d < 1; d += 0.024) stitchLine(at(d, 0), at(d + 1, 1), Math.max(1, S * 0.002), S * 0.008, S * 0.007, P.indigo, 0.16);
      },
      () => k.drawPolygon({ pts }),
    );
  }

  // --- the lines pieces move along -----------------------------------------------------
  const lineW = S * 0.012;
  for (const line of def.lines) {
    const pts = line.map(pt);
    k.drawLines({ pts: pts.map((p) => p.add(k.vec2(0, S * 0.003))), width: lineW * 1.9, color: col("#50280f"), opacity: 0.16, join: "round", cap: "round" });
    k.drawLines({ pts, width: lineW * 1.25, color: col(P.madder), opacity: 0.28, join: "round", cap: "round" });
  }
  for (const line of def.lines) {
    const pts = line.map(pt);
    stitchPolyline(pts, lineW * 0.62, S * 0.02, S * 0.011, P.madder);
    stitchPolyline(pts.map((p) => p.sub(S * 0.0013, S * 0.0013)), Math.max(1, lineW * 0.18), S * 0.02, S * 0.011, "#ffd2be", 0.45);
  }

  // --- points: embroidered rosettes ----------------------------------------------------
  const cell = cellSize(def) * S;
  const rr = Math.min(cell * 0.17, S * 0.034);
  for (let p = 0; p < def.coords.length; p++) {
    k.drawCircle({ pos: pt(p), radius: rr * 1.15, color: col(P.clothLight) });
    rosette(pt(p), rr, P.indigo, P.marigold);
  }

  // --- labels --------------------------------------------------------------------------
  if (opts.labels !== false) {
    const color = col(P.indigo);
    if (!def.gridLabels) {
      // Numbers sit beside each point, facing the middle of the board. (Square boards skip
      // labels: they would sit under the pieces. The move log names their points a1..e5.)
      const size = Math.min(cell * 0.2, S * 0.032);
      const centre = at(0.5, 0.5);
      for (let p = 0; p < def.coords.length; p++) {
        const d = centre.sub(pt(p));
        const dir = d.len() < 1 ? k.vec2(1, 0) : k.vec2(Math.sign(Math.round(d.x)) || 1, Math.sign(Math.round(d.y)) * 0.15).unit();
        const pos = pt(p).add(dir.scale(cell * 0.52)).add(0, -cell * 0.18);
        k.drawCircle({ pos, radius: size * 0.75, color: col(P.clothLight), opacity: 0.85 });
        k.drawText({ text: def.labels[p], pos: pos.add(0, size * 0.05), size, font: "ui-bold", anchor: "center", color, opacity: 0.7 });
      }
    }
  }
}

function stitchedFrame(at: (u: number, v: number) => Vec2, S: number, inset: number, color: string, w: number, dash: number, gap: number) {
  const a = inset, b = 1 - inset;
  const r = 0.03; // corner cut, so corners look rounded
  stitchLine(at(a + r, a), at(b - r, a), w, dash, gap, color);
  stitchLine(at(b, a + r), at(b, b - r), w, dash, gap, color);
  stitchLine(at(b - r, b), at(a + r, b), w, dash, gap, color);
  stitchLine(at(a, b - r), at(a, a + r), w, dash, gap, color);
  const corners: [number, number, number][] = [[a + r, a + r, 1], [b - r, a + r, 1.5], [b - r, b - r, 0], [a + r, b - r, 0.5]];
  for (const [cu, cv, start] of corners) {
    const pts: Vec2[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = (start + (i / 6) * 0.5) * Math.PI;
      pts.push(at(cu + r * Math.cos(t), cv + r * Math.sin(t)));
    }
    k.drawLines({ pts, width: w, color: col(color), cap: "round", join: "round" });
  }
}

/** A band of small triangles alternating red and indigo, `mid` in from the edge. */
function sawtooth(at: (u: number, v: number) => Vec2, mid: number, h: number) {
  const step = h * 1.5;
  const sides: [number, number, number, number][] = [
    [mid, mid, 1, 0],
    [1 - mid, mid, 0, 1],
    [1 - mid, 1 - mid, -1, 0],
    [mid, 1 - mid, 0, -1],
  ];
  for (const [su, sv, du, dv] of sides) {
    const len = 1 - 2 * mid;
    const count = Math.floor((len - h * 3) / step);
    const start = (len - count * step) / 2;
    const nu = -dv, nv = du; // normal
    for (let i = 0; i < count; i++) {
      const t = start + i * step;
      const cu = su + du * t, cv = sv + dv * t;
      k.drawTriangle({
        p1: at(cu - (nu * h) / 2, cv - (nv * h) / 2),
        p2: at(cu + du * step * 0.9 - (nu * h) / 2, cv + dv * step * 0.9 - (nv * h) / 2),
        p3: at(cu + du * step * 0.45 + (nu * h) / 2, cv + dv * step * 0.45 + (nv * h) / 2),
        color: col(i % 2 ? P.indigo : P.madder),
        opacity: i % 2 ? 0.75 : 0.8,
      });
    }
  }
}
