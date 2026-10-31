// The front door: pick a game. Bagh-Chagol keeps its moonlit kantha look;
// Four in a Row is a sunny day with the KAPLAY crew.

import { drawFit } from "../art/crew";
import { PALETTE as P } from "../art/palette";
import { drawScenery, drawTitle as drawBaghTitle } from "../art/scenery";
import { col, k } from "../engine";
import { Fireflies } from "../fx";
import { FourRowState, type FourRowDef } from "../fourrow/rules";
import { cellCenter, drawBoardBack, drawBoardFront, drawDisc, FR, holeRadius, type BoardGeom } from "../fourrow/art";
import { drawTitle } from "../fourrow/widgets";
import { share } from "../share";
import { soundOn, toggleSound } from "../sound";
import { card, text, UI, type Rect } from "../ui";

export function homeScene(fourRowDef: FourRowDef) {
  const ui = new UI({ crewCursor: true });
  const fireflies = new Fireflies();
  const lift = [0, 0];
  // A position from a real game, for the four-in-a-row card.
  const sample = [3, 3, 4, 2, 2, 4, 5, 6, 4].reduce((s, c) => s.apply(c), FourRowState.initial(fourRowDef));

  const go = (scene: "menu" | "fourrow-menu") => k.go(scene);
  k.onMousePress((btn) => {
    if (btn === "left") ui.click(k.mousePos().x, k.mousePos().y);
  });

  k.onDraw(() => {
    ui.beginFrame();
    const w = k.width(), h = k.height(), t = k.time();
    drawScenery(w, h);
    fireflies.draw(w, h);

    const s = Math.max(40, Math.min(52, w * 0.06)), m = 14;
    ui.iconButton({ x: w - m - s, y: m, w: s, h: s }, "crew-share", () => void share("Board games vs a self-taught AI", "Play Bagh-Chagol and Four in a Row against an AI that learned by playing itself."), { tooltip: "Share" });
    ui.iconButton({ x: w - m - 2 * s - 10, y: m, w: s, h: s }, "crew-sounds", toggleSound, { tooltip: soundOn ? "Sound: on" : "Sound: off", crossed: !soundOn });

    const portrait = w < h * 0.95;
    const titleSize = Math.min(64, w * 0.08);
    const gap = 22;
    const cw = portrait ? Math.min(w - 32, 460) : Math.min((w - 3 * gap) / 2, 470);
    const ch = portrait ? Math.min((h - 90 - titleSize * 1.6 - gap) / 2, 330) : Math.min(h - 120 - titleSize * 1.6, 470);
    const totalH = titleSize * 1.6 + (portrait ? 2 * ch + gap : ch);
    const y0 = Math.max(s + m + 6, (h - totalH) / 2);

    drawTitle(w / 2, y0 + titleSize * 0.55, titleSize, "PICK A GAME");
    const cy = y0 + titleSize * 1.6;
    const rects: Rect[] = portrait
      ? [{ x: (w - cw) / 2, y: cy, w: cw, h: ch }, { x: (w - cw) / 2, y: cy + ch + gap, w: cw, h: ch }]
      : [{ x: w / 2 - cw - gap / 2, y: cy, w: cw, h: ch }, { x: w / 2 + gap / 2, y: cy, w: cw, h: ch }]; // prettier-ignore

    rects.forEach((r, i) => {
      const over = ui.area(r, () => go(i === 0 ? "menu" : "fourrow-menu"));
      lift[i] += ((over ? 1 : 0) - lift[i]) * Math.min(1, k.dt() * 10);
      const R = { ...r, y: r.y - lift[i] * 8 };
      if (i === 0) baghCard(R, t, over);
      else fourRowCard(R, t, over);
    });
    ui.endFrame();
  });

  function baghCard(R: Rect, t: number, over: boolean) {
    card(R, { opacity: 0.94, edge: over ? P.gold : P.panelEdge, radius: 24 });
    const art = Math.min(R.w * 0.8, R.h - 130);
    drawBaghTitle(k.vec2(R.x + R.w / 2, R.y + art * 0.32), art * 0.42);
    const py = R.y + art * 0.78;
    k.drawSprite({ sprite: "tiger", pos: k.vec2(R.x + R.w / 2 - art * 0.2, py + Math.sin(t * 2) * 3), anchor: "center", width: art * 0.36, height: art * 0.36 });
    k.drawSprite({ sprite: "goat", pos: k.vec2(R.x + R.w / 2 + art * 0.2, py - Math.sin(t * 2) * 3), anchor: "center", width: art * 0.32, height: art * 0.32 });
    footer(R, "Bagh-Chagol", "One tiger against a herd of goats. A traditional Bengali hunt game.", P.gold, over);
  }

  function fourRowCard(R: Rect, t: number, over: boolean) {
    card(R, { opacity: 0.97, color: "#bfe9ff", edge: over ? FR.yellow : FR.boardEdge, radius: 24 });
    const art = Math.min(R.w * 0.8, R.h - 130);
    const cell = art / (fourRowDef.cols + 1.2);
    const g: BoardGeom = { x: R.x + (R.w - cell * fourRowDef.cols) / 2, y: R.y + 26 + cell * 0.4, cell, rows: fourRowDef.rows, cols: fourRowDef.cols };
    drawBoardBack(g);
    for (let i = 0; i < sample.grid.length; i++) {
      if (!sample.grid[i]) continue;
      const p = cellCenter(g, Math.floor(i / g.cols), i % g.cols);
      const side = (sample.grid[i] - 1) as 0 | 1;
      drawDisc(p.x, p.y, holeRadius(g) * 0.96, side, side === 0 ? "bean" : "ghosty");
    }
    drawBoardFront(g);
    // A disc about to drop, bobbing above the board.
    const dx = cellCenter(g, 0, 4).x;
    drawDisc(dx, g.y - cell * 0.55 + Math.sin(t * 4) * cell * 0.08, holeRadius(g) * 0.96, 0, "bean");
    drawFit("crew-sparkles", g.x + g.cols * cell + cell * 0.3, g.y - cell * 0.3, cell * 1.1, { angle: Math.sin(t * 2) * 10 });
    footer(R, "Four in a Row", "Drop discs, line up four. Play against the KAPLAY crew.", FR.yellow, over, true);
  }

  function footer(R: Rect, title: string, blurb: string, accent: string, over: boolean, light = false) {
    text(title, R.x + 22, R.y + R.h - 112, { size: 26, font: "ui-bold", color: light ? FR.boardEdge : accent });
    text(blurb, R.x + 22, R.y + R.h - 78, { size: 15, color: light ? "#3d3566" : P.inkDim, width: R.w - 44 - 120 });
    const bw = 104, bh = 46;
    const bx = R.x + R.w - bw - 18, by = R.y + R.h - bh - 18;
    k.drawRect({ pos: k.vec2(bx, by + 3), width: bw, height: bh, radius: 14, color: col("#000000"), opacity: 0.25 });
    k.drawRect({ pos: k.vec2(bx, by), width: bw, height: bh, radius: 14, color: col(over ? "#f8c04f" : "#f0a92e") });
    drawFit("crew-play-o", bx + 26, by + bh / 2, 30, { angle: over ? Math.sin(k.time() * 10) * 8 : 0 });
    text("Play", bx + 46, by + bh / 2, { size: 20, font: "ui-bold", color: "#2a1606", anchor: "left" });
  }
}
