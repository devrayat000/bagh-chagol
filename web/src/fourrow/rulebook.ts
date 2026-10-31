// The Four in a Row rulebook: six pages, each acting its rule out on a little board.

import { AVATAR_NAMES, drawFit, type Avatar } from "../art/crew";
import { col, k } from "../engine";
import { burst, caption, Rulebook, span, stamp, type BookTheme, type RulePage } from "../rulebook";
import type { Rect } from "../ui";
import { cellCenter, drawBoardBack, drawBoardFront, drawDisc, FR, holeRadius, type BoardGeom } from "./art";
import type { FourRowDef, Side } from "./rules";

const THEME: BookTheme = {
  cover: FR.board,
  coverEdge: FR.boardEdge,
  paper: "#fffaf0",
  paperShade: "#ece4d2",
  ink: FR.ink,
  inkDim: "#8a82ad",
  accent: FR.yellow,
  titleFont: "happy-o",
  titleColors: [FR.red, FR.yellow],
  styles: { red: FR.redRim, yellow: "#c78c00", hi: FR.board, win: "#2f9e44" },
  mascot: (x, y, size, t) => drawFit("crew-wizarding-o", x, y - size * 0.45 + Math.sin(t * 2.5) * 4, size, { angle: Math.sin(t * 1.7) * 5 }),
};

/** A disc that falls into place: where it is `age` seconds after it was dropped. */
function fallY(g: BoardGeom, row: number, age: number): number {
  const from = g.y - g.cell * 0.7, to = cellCenter(g, row, 0).y;
  return from + (to - from) * k.easings.easeOutBounce(Math.min(1, age / (0.25 + row * 0.05)));
}

interface Drop {
  r: number;
  c: number;
  side: Side;
  at: number; // seconds into the animation when it's dropped; < 0 = already there
}

export function fourRowRulebook(def: FourRowDef, avatars: () => [Avatar, Avatar], onClose?: () => void) {
  const { rows, cols } = def;

  /** Fit a board into the stage, leaving `top` cells free above it for a disc in the air. */
  function fit(r: Rect, top = 1): BoardGeom {
    const cell = Math.min(r.w / (cols + 0.6), (r.h - 34) / (rows + top + 0.9));
    return { x: r.x + (r.w - cell * cols) / 2, y: r.y + cell * top + 4, cell, rows, cols };
  }

  /** Board with discs; discs dropped at `at` fall in. Returns nothing - pure drawing for time t. */
  function board(g: BoardGeom, discs: Drop[], t: number, glowCol: number | null = null) {
    const [a0, a1] = avatars();
    const rad = holeRadius(g) * 0.95;
    drawBoardBack(g);
    for (const d of discs) {
      if (t < d.at) continue;
      const x = cellCenter(g, d.r, d.c).x;
      drawDisc(x, d.at < 0 ? cellCenter(g, d.r, d.c).y : fallY(g, d.r, t - d.at), rad, d.side, d.side === 0 ? a0 : a1);
    }
    drawBoardFront(g, glowCol, glowCol === null ? 0 : 1);
  }

  /** Rings around cells, e.g. the winning line. */
  function rings(g: BoardGeom, cells: [number, number][], t: number, color = "#ffffff") {
    const pulse = 0.5 + 0.5 * Math.sin(t * 8);
    for (const [r, c] of cells) k.drawCircle({ pos: cellCenter(g, r, c), radius: holeRadius(g) * (1.02 + 0.06 * pulse), fill: false, outline: { width: g.cell * 0.08, color: col(color) } });
  }

  /** Discs dropped one after another, from (row, col, side) triples, starting at `start`. */
  const seq = (cells: [number, number, Side][], start: number, every: number): Drop[] => cells.map(([r, c, side], i) => ({ r, c, side, at: start + i * every }));
  const placed = (cells: [number, number, Side][]): Drop[] => cells.map(([r, c, side]) => ({ r, c, side, at: -1 }));
  const B = rows - 1; // bottom row

  const pages = (): RulePage[] => {
    const [a0, a1] = avatars();
    return [
      {
        title: "Drop a disc",
        body: "On your turn, click a column (or press its number key, [hi]1-7[/hi]).\n\nYour disc drops down and lands in the [hi]lowest free hole[/hi] of that column: it can't float, and it can't go in a full column.",
        loop: 4.6,
        demo: (r, t) => {
          const g = fit(r);
          const col3 = cellCenter(g, 0, 3).x, col1 = cellCenter(g, 0, 1).x;
          const handX = col1 + (col3 - col1) * span(t, 0.3, 0.9, k.easings.easeInOutCubic);
          const dropAt = 1.6;
          const discs = [...placed([[B, 3, 1], [B - 1, 3, 0], [B, 2, 0]]), { r: B - 2, c: 3, side: 0 as Side, at: dropAt }];
          board(g, discs, t, t > 1.1 && t < 2.6 ? 3 : null);
          if (t < dropAt) drawDisc(handX, g.y - g.cell * 0.7, holeRadius(g) * 0.95, 0, a0); // held over the board
          const pressed = t > 1.35 && t < 1.7;
          drawFit(pressed ? "crew-knock-o" : "crew-pointer-o", handX + g.cell * 0.25, g.y - g.cell * 0.35, g.cell * 0.75, { angle: pressed ? -10 : 0 });
          if (t > 2.2) {
            const p = cellCenter(g, B - 2, 3);
            k.drawCircle({ pos: p, radius: holeRadius(g) * 1.12, fill: false, outline: { width: 4, color: col(FR.yellow) }, opacity: Math.min(1, (t - 2.2) * 3) });
            caption("lowest free hole!", r.x + r.w / 2, r.y + r.h - 14, FR.ink);
          }
        },
      },
      {
        title: "Take turns",
        body: `[red]Red[/red] always goes first, then [yellow]yellow[/yellow], then red again, and so on.\n\nIn the menu you choose whether you are red (first) or yellow (second). Your discs show your crew member, like ${AVATAR_NAMES[a0]} here.`,
        loop: 6.4,
        demo: (r, t) => {
          const g = fit(r);
          const moves: [number, number, Side][] = [[B, 3, 0], [B, 4, 1], [B - 1, 3, 0], [B, 2, 1], [B - 1, 4, 0], [B - 2, 3, 1]];
          board(g, seq(moves, 0.5, 0.8), t);
          const turn = Math.min(moves.length, Math.max(0, Math.floor((t - 0.5) / 0.8) + 1)) % 2;
          // A little scoreboard: whose turn is it?
          const y = r.y + r.h - 16, cx = r.x + r.w / 2;
          ([0, 1] as Side[]).forEach((s) => {
            const x = cx + (s === 0 ? -1 : 1) * Math.min(90, r.w * 0.22);
            const on = turn === s;
            drawDisc(x, y - (on ? Math.abs(Math.sin(t * 6)) * 6 : 0), on ? 15 : 12, s, s === 0 ? a0 : a1, on ? 1 : 0.5);
          });
          caption("turn", cx, y, FR.ink, 15);
        },
      },
      {
        title: "Four in a line wins",
        body: "Be the first to get [win]four of your discs in a straight line[/win]:\n• across,\n• up and down, or\n• diagonally.\n\nThe moment you make one, you win!",
        loop: 3 * 3.4,
        demo: (r, t) => {
          const g = fit(r);
          const round = Math.floor(t / 3.4), lt = t % 3.4;
          const lines: { label: string; under: [number, number, Side][]; line: [number, number][] }[] = [
            { label: "ACROSS!", under: [], line: [[B, 1], [B, 2], [B, 3], [B, 4]] },
            { label: "UP & DOWN!", under: [], line: [[B, 5], [B - 1, 5], [B - 2, 5], [B - 3, 5]] },
            { label: "DIAGONAL!", under: [[B, 1, 1], [B, 2, 1], [B - 1, 2, 1], [B, 3, 1], [B - 1, 3, 1], [B - 2, 3, 1]], line: [[B, 0], [B - 1, 1], [B - 2, 2], [B - 3, 3]] },
          ];
          const L = lines[round];
          const discs = [...placed(L.under), ...seq(L.line.map(([rr, c]) => [rr, c, 0] as [number, number, Side]), 0.2, 0.45)];
          board(g, discs, lt);
          const done = 0.2 + 3 * 0.45 + 0.4;
          if (lt > done) {
            rings(g, L.line, lt);
            for (const [i, [rr, c]] of L.line.entries()) {
              const p = cellCenter(g, rr, c);
              burst(p.x, p.y, lt - done, { seed: 7 + i, n: 6, speed: g.cell * 2.2, size: g.cell * 0.45, sprites: ["crew-star", "crew-sparkle"], life: 0.8 });
            }
            stamp(L.label, r.x + r.w / 2, r.y + r.h - 22, lt - done, { color: "#2f9e44", size: Math.min(26, r.w * 0.06) });
          }
        },
      },
      {
        title: "Block!",
        body: "Watch your opponent too. When they have [yellow]three in a line[/yellow] with a free hole next to it, drop your disc there to [hi]block[/hi] it.\n\nIf you don't, they win on their next turn.",
        loop: 5,
        demo: (r, t) => {
          const g = fit(r);
          const discs = [...placed([[B, 0, 1], [B, 1, 1], [B, 2, 1], [B, 5, 0], [B - 1, 5, 0], [B, 6, 0]]), { r: B, c: 3, side: 0 as Side, at: 2.2 }];
          board(g, discs, t, t > 1.4 && t < 2.6 ? 3 : null);
          if (t < 2.4) {
            // Danger! The hole that would make four.
            const p = cellCenter(g, B, 3), pulse = 0.5 + 0.5 * Math.sin(t * 10);
            k.drawCircle({ pos: p, radius: holeRadius(g) * (0.9 + 0.15 * pulse), color: col("#e5544b"), opacity: 0.35 + 0.3 * pulse });
            k.drawText({ text: "!", font: "happy-o", size: g.cell * 0.7, pos: p, anchor: "center", color: col("#ffffff") });
            rings(g, [[B, 0], [B, 1], [B, 2]], t, "#e5544b");
          } else {
            const p = cellCenter(g, B, 3);
            burst(p.x, p.y, t - 2.5, { seed: 3, n: 10, speed: g.cell * 2.5, size: g.cell * 0.4, sprites: ["crew-sparkles"], life: 0.8 });
            stamp("BLOCKED!", r.x + r.w / 2, r.y + r.h - 22, t - 2.5, { color: FR.board, size: Math.min(26, r.w * 0.06) });
            drawFit("crew-beant", cellCenter(g, B - 1, 1).x, cellCenter(g, B - 1, 1).y, g.cell * 0.9, { angle: Math.sin(t * 6) * 8 });
          }
        },
      },
      {
        title: "A full board is a draw",
        body: "If all 42 holes fill up and [hi]nobody has four in a line[/hi], the game is a draw.\n\nNobody wins, nobody loses. Play again!",
        loop: 42 * 0.09 + 3,
        demo: (r, t) => {
          const g = fit(r);
          // A real drawn game (checked against the Python rules), dropped quickly.
          const order = [5, 5, 5, 0, 5, 4, 4, 6, 6, 3, 5, 1, 3, 5, 2, 1, 2, 3, 0, 4, 1, 4, 3, 0, 2, 2, 2, 1, 0, 0, 0, 2, 1, 6, 1, 3, 4, 4, 3, 6, 6, 6];
          const heights = new Array(cols).fill(0);
          const discs = order.map((c, i) => ({ r: B - heights[c]++, c, side: (i % 2) as Side, at: 0.2 + i * 0.09 }));
          board(g, discs, t);
          const full = 0.2 + order.length * 0.09 + 0.4;
          if (t > full) {
            stamp("DRAW!", r.x + r.w / 2, g.y + (rows * g.cell) / 2, t - full, { color: FR.boardEdge, size: Math.min(40, r.w * 0.09) });
            const y = r.y + r.h - 18;
            drawFit(`crew-${a0}`, r.x + r.w / 2 - 40, y, 34, { angle: Math.sin(t * 4) * 10 });
            drawFit(`crew-${a1}`, r.x + r.w / 2 + 40, y, 34, { angle: -Math.sin(t * 4) * 10, flipX: true });
          }
        },
      },
      {
        title: "Tips",
        body: "• The [hi]middle column[/hi] is part of the most lines: it's a strong place to start.\n• Try to make [win]two threats at once[/win]: they can only block one.\n• Pressed the wrong column? [hi]Undo[/hi] takes back your move and the AI's reply.",
        loop: 4.2,
        demo: (r, t) => {
          const g = fit(r);
          // Count how many lines of four pass through each hole: the middle wins.
          board(g, [], t, 3);
          const counts = [3, 4, 5, 7, 5, 4, 3];
          for (let c = 0; c < cols; c++) {
            const p = cellCenter(g, B, c);
            const pop = span(t, 0.3 + c * 0.15, 0.3, k.easings.easeOutBack);
            if (pop <= 0) continue;
            k.drawCircle({ pos: p, radius: holeRadius(g) * 0.75 * pop, color: col(c === 3 ? FR.yellow : "#ffffff") });
            k.drawText({ text: String(counts[c] ?? 0), font: "happy", size: g.cell * 0.45 * pop, pos: p, anchor: "center", color: col(FR.ink) });
          }
          if (t > 1.6) caption("lines through each bottom hole", r.x + r.w / 2, r.y + r.h - 14, FR.ink, 15);
          if (t > 2) drawFit("crew-sparkling", cellCenter(g, B - 1, 3).x, cellCenter(g, B - 1, 3).y, g.cell * 0.9, { frame: Math.floor(t * 10) });
        },
      },
    ];
  };

  return new Rulebook(pages, THEME, onClose);
}
