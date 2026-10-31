// Four-in-a-row artwork: a sunny KAWorld day built from KAPLAY crew sprites,
// and the board itself. The board front is drawn with its holes cut out
// (kaplay's drawSubtracted), so discs sit - and fall - behind it like the toy.

import { col, k } from "../engine";
import { drawFit, type Avatar } from "../art/crew";
import type { Side } from "./rules";

export const FR = {
  skyTop: "#4fb6ff",
  skyBottom: "#c9f0ff",
  hill: "#7bd65a",
  hillDark: "#55b23f",
  board: "#5a4bd6", // KAPLAY purple
  boardLight: "#7d6ff0",
  boardEdge: "#2f2490",
  boardBack: "#21195a",
  ink: "#2d2750",
  red: "#ff5d5d",
  redRim: "#c8323c",
  yellow: "#ffd447",
  yellowRim: "#d99a00",
  gold: "#ffe08a",
};

export const sideColor = (s: Side) => (s === 0 ? FR.red : FR.yellow);
export const sideRim = (s: Side) => (s === 0 ? FR.redRim : FR.yellowRim);
export const sideName = (s: Side) => (s === 0 ? "red" : "yellow");

// ----- background ----------------------------------------------------------------------

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const rand = rng(7);
const CLOUDS = Array.from({ length: 7 }, () => ({ x: rand(), y: 0.05 + rand() * 0.38, s: 0.6 + rand() * 0.8, v: 0.006 + rand() * 0.012 }));
const FLOWERS = Array.from({ length: 9 }, () => ({ x: rand(), s: 0.7 + rand() * 0.5, p: rand() * 6 }));

/** Sky, sun, drifting clouds, grassy hills with flowers and a butterfly. */
export function drawDay(w: number, h: number) {
  const u = Math.min(w, h);
  const t = k.time();
  k.drawRect({ pos: k.vec2(0, 0), width: w, height: h, gradient: [col(FR.skyTop), col(FR.skyBottom)] });

  // Sun with soft rays.
  const sun = k.vec2(w - u * 0.12, u * 0.12);
  k.drawCircle({ pos: sun, radius: u * 0.16, color: col("#fff6b0"), opacity: 0.25 + 0.05 * Math.sin(t * 2) });
  drawFit("crew-sun", sun.x, sun.y, u * 0.17, { angle: Math.sin(t * 0.6) * 8 });

  for (const c of CLOUDS) {
    const x = ((c.x + t * c.v) % 1.3) * (w + u * 0.4) - u * 0.25;
    drawFit("crew-cloud", x, c.y * h, u * 0.13 * c.s, { opacity: 0.95 });
  }

  // Two rolling hills, then a row of grass tiles along the bottom.
  const hill = (x: number, base: number, amp: number, freq: number) => h - base - Math.sin(x * freq + 1.3) * amp;
  for (const [base, amp, freq, color] of [[h * 0.16, h * 0.03, 4.1 / w, FR.hillDark], [h * 0.09, h * 0.025, 6.3 / w, FR.hill]] as const) {
    const step = 6;
    for (let x = 0; x < w; x += step) {
      const y = hill(x, base, amp, freq);
      k.drawRect({ pos: k.vec2(x, y), width: step + 1, height: h - y, color: col(color) });
    }
  }
  const tile = Math.max(28, u * 0.06);
  for (let x = 0; x < w + tile; x += tile) drawFit("crew-grass", x + tile / 2, h - tile / 2, tile * 1.02);

  for (const f of FLOWERS) {
    const x = f.x * w, y = hill(x, h * 0.09, h * 0.025, 6.3 / w) + tile * 0.1;
    drawFit("crew-flowy", x, y, tile * 0.9 * f.s, { anchor: "bot", angle: Math.sin(t * 1.5 + f.p) * 6 });
  }

  const bx = ((t * 0.04) % 1.4) * w - w * 0.2;
  const by = h * 0.55 + Math.sin(t * 1.3) * h * 0.06;
  drawFit("crew-btfly", bx, by, u * 0.05, { angle: Math.sin(t * 8) * 12 });
}

// ----- board ----------------------------------------------------------------------------

/** Where the board's holes are: top-left corner of the grid, and the cell size. */
export interface BoardGeom {
  x: number;
  y: number;
  cell: number;
  rows: number;
  cols: number;
}

export const pad = (g: BoardGeom) => g.cell * 0.2;
export const holeRadius = (g: BoardGeom) => g.cell * 0.4;
export const cellCenter = (g: BoardGeom, row: number, col: number) => k.vec2(g.x + (col + 0.5) * g.cell, g.y + (row + 0.5) * g.cell);

/** The dark back plate, seen through empty holes. Draw first, then the discs, then the front. */
export function drawBoardBack(g: BoardGeom) {
  const p = pad(g);
  k.drawRect({ pos: k.vec2(g.x - p * 0.6, g.y - p * 0.6), width: g.cols * g.cell + p * 1.2, height: g.rows * g.cell + p * 1.2, radius: p, color: col(FR.boardBack) });
}

/** The front of the board with the holes cut out. `glowCol` lights up one column. */
export function drawBoardFront(g: BoardGeom, glowCol: number | null = null, glow = 0) {
  const p = pad(g), W = g.cols * g.cell, H = g.rows * g.cell;
  // Feet, like the plastic stand of the real toy.
  for (const fx of [g.x - p * 0.2, g.x + W + p * 0.2]) {
    k.drawPolygon({ pts: [k.vec2(fx - p * 1.6, g.y + H + p * 2.6), k.vec2(fx + p * 1.6, g.y + H + p * 2.6), k.vec2(fx, g.y + H - p)], color: col(FR.boardEdge) });
  }
  k.drawRect({ pos: k.vec2(g.x - p, g.y - p + 6), width: W + 2 * p, height: H + 2 * p, radius: p * 1.4, color: col("#000000"), opacity: 0.25 });
  k.drawSubtracted(
    () => {
      k.drawRect({ pos: k.vec2(g.x - p, g.y - p), width: W + 2 * p, height: H + 2 * p, radius: p * 1.4, color: col(FR.boardEdge) });
      k.drawRect({ pos: k.vec2(g.x - p + 4, g.y - p + 3), width: W + 2 * p - 8, height: H + 2 * p - 10, radius: p * 1.2, color: col(FR.board) });
      k.drawRect({ pos: k.vec2(g.x - p + 10, g.y - p + 6), width: W + 2 * p - 20, height: p * 0.5, radius: p * 0.25, color: col(FR.boardLight), opacity: 0.6 });
      if (glowCol !== null && glow > 0) {
        k.drawRect({ pos: k.vec2(g.x + glowCol * g.cell + 2, g.y - p + 3), width: g.cell - 4, height: H + 2 * p - 10, radius: g.cell * 0.3, color: col("#ffffff"), opacity: 0.16 * glow });
      }
    },
    () => {
      for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) k.drawCircle({ pos: cellCenter(g, r, c), radius: holeRadius(g) });
    },
  );
  // A thin dark rim around each hole gives it depth.
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++)
      k.drawCircle({ pos: cellCenter(g, r, c), radius: holeRadius(g), fill: false, outline: { width: Math.max(2, g.cell * 0.035), color: col(FR.boardEdge) } });
}

/** A disc in a side's colour with the player's crew member printed on it. */
export function drawDisc(x: number, y: number, r: number, side: Side, avatar: Avatar | null, opacity = 1, squash = 1) {
  k.pushTransform();
  k.pushTranslate(x, y);
  k.pushScale(1 / squash, squash);
  const o = k.vec2(0, 0);
  k.drawCircle({ pos: o, radius: r, color: col(sideRim(side)), opacity });
  k.drawCircle({ pos: o, radius: r * 0.86, color: col(sideColor(side)), opacity });
  k.drawCircle({ pos: o, radius: r * 0.7, fill: false, outline: { width: Math.max(1.5, r * 0.06), color: col(sideRim(side)) }, opacity: opacity * 0.6 });
  k.drawCircle({ pos: k.vec2(-r * 0.32, -r * 0.38), radius: r * 0.2, color: col("#ffffff"), opacity: opacity * 0.35 }); // shine
  if (avatar) drawFit(`crew-${avatar}`, 0, r * 0.04, r * 1.12, { opacity });
  k.popTransform();
}
