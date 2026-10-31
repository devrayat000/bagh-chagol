import { DIFFICULTIES, type AiClient } from "../ai/client";
import { drawBoard, pieceRadius, pointUV } from "../art/board";
import { PALETTE as P } from "../art/palette";
import { drawScenery, drawTitle } from "../art/scenery";
import { col, k } from "../engine";
import { Fireflies } from "../fx";
import { saveSettings, type MapEntry, type Settings } from "../maps";
import { GOAT_SIDE, TIGER_SIDE, type Side } from "../rules";
import { card, text, UI, type Rect } from "../ui";
import type { PlayArgs } from "./play";

export function menuScene(maps: MapEntry[], settings: Settings, ai: AiClient) {
  const ui = new UI();
  const fireflies = new Fireflies();
  const hoverAnim = new Map<string, number>();
  let starting = false;

  const current = () => maps.find((m) => m.def.id === settings.mapId) ?? maps[0];

  async function start() {
    if (starting) return;
    starting = true;
    saveSettings(settings);
    const entry = current();
    await ai.load(entry.def, entry.modelUrl);
    const difficulty = DIFFICULTIES.find((d) => d.id === settings.difficulty)!;
    k.go("play", { entry, human: settings.side, difficulty, ai } satisfies PlayArgs);
  }

  k.onMousePress((btn) => {
    if (btn === "left") ui.click(k.mousePos().x, k.mousePos().y);
  });
  k.onKeyPress("enter", start);

  k.onDraw(() => {
    ui.beginFrame();
    const w = k.width(), h = k.height();
    drawScenery(w, h);
    fireflies.draw(w, h);

    const portrait = w < h * 0.9;
    const cw = Math.min(w - 32, 1120);
    const t = k.time();

    // Sizes first, so the whole menu can be centred vertically.
    const titleH = Math.min(150, w * 0.09, h * 0.16) * (portrait ? 1.6 : 1);
    const headH = titleH + 44;
    const cols = portrait ? 2 : 4, gap = 14;
    const controlsH = portrait ? 230 : 110;
    const rows = Math.ceil(maps.length / cols);
    const textH = 84;
    const spare = h - headH - controlsH - 40 - gap * (rows - 1);
    const cardW = Math.max(120, Math.min((cw - gap * (cols - 1)) / cols, (spare / rows - textH) / 0.92));
    const cardH = cardW * 0.92 + textH;
    const totalH = headH + rows * cardH + (rows - 1) * gap + 18 + controlsH;

    // Title.
    let y = Math.max(10, (h - totalH) / 2);
    drawTitle(k.vec2(w / 2, y + titleH / 2 + Math.sin(t * 1.2) * 2), titleH);
    y += titleH + 6;
    text("Bagh-Chagol  ·  one tiger against a herd of goats", w / 2, y, { size: Math.min(18, w * 0.04), color: P.inkDim, anchor: "top" });
    y += 38;

    // Map cards.
    const gridW = cols * cardW + (cols - 1) * gap;
    maps.forEach((m, i) => {
      const r = { x: (w - gridW) / 2 + (i % cols) * (cardW + gap), y: y + Math.floor(i / cols) * (cardH + gap), w: cardW, h: cardH };
      drawMapCard(m, r);
    });
    y += rows * cardH + (rows - 1) * gap + 18;

    // Side, difficulty, play.
    const entry = current();
    const firstSide: Side = entry.def.rules.first === "tiger" ? TIGER_SIDE : GOAT_SIDE;
    const sideBtn = (r: Rect, side: Side) =>
      ui.button(r, {
        label: (side === TIGER_SIDE ? "Tiger" : "Goats") + (side === firstSide ? " (first)" : ""),
        sprite: side === TIGER_SIDE ? "tiger" : "goat",
        active: settings.side === side,
        accent: side === TIGER_SIDE ? P.tiger : P.goat,
        size: 17,
        onClick: () => (settings.side = side),
      });
    const diffBtns = (x: number, yy: number, width: number) => {
      const bw = (width - 2 * 8) / 3;
      DIFFICULTIES.forEach((d, i) =>
        ui.button({ x: x + i * (bw + 8), y: yy, w: bw, h: 44 }, { label: d.label, active: settings.difficulty === d.id, size: 17, onClick: () => (settings.difficulty = d.id) }),
      );
    };

    if (!portrait) {
      const groupW = Math.min(cw, 980);
      const gx = (w - groupW) / 2;
      const sideW = groupW * 0.36, diffW = groupW * 0.36, playW = groupW - sideW - diffW - 48;
      text("Play as", gx, y, { size: 15, color: P.inkDim });
      sideBtn({ x: gx, y: y + 24, w: sideW / 2 - 4, h: 52 }, GOAT_SIDE);
      sideBtn({ x: gx + sideW / 2 + 4, y: y + 24, w: sideW / 2 - 4, h: 52 }, TIGER_SIDE);
      text("Difficulty", gx + sideW + 24, y, { size: 15, color: P.inkDim });
      diffBtns(gx + sideW + 24, y + 28, diffW);
      ui.button({ x: gx + groupW - playW, y: y + 20, w: playW, h: 60 }, { label: starting ? "Loading…" : "Play", style: "primary", size: 26, onClick: start });
    } else {
      const gw = Math.min(cw, 520), gx = (w - gw) / 2;
      text("Play as", gx, y, { size: 15, color: P.inkDim });
      sideBtn({ x: gx, y: y + 22, w: gw / 2 - 5, h: 50 }, GOAT_SIDE);
      sideBtn({ x: gx + gw / 2 + 5, y: y + 22, w: gw / 2 - 5, h: 50 }, TIGER_SIDE);
      text("Difficulty", gx, y + 84, { size: 15, color: P.inkDim });
      diffBtns(gx, y + 106, gw);
      ui.button({ x: gx, y: y + 164, w: gw, h: 56 }, { label: starting ? "Loading…" : "Play", style: "primary", size: 24, onClick: start });
    }
    ui.endFrame();
  });

  function drawMapCard(m: MapEntry, r: Rect) {
    const id = m.def.id;
    const selected = settings.mapId === id;
    const over = ui.area(r, () => (settings.mapId = id));
    const a = (hoverAnim.get(id) ?? 0) + ((over || selected ? 1 : 0) - (hoverAnim.get(id) ?? 0)) * Math.min(1, k.dt() * 10);
    hoverAnim.set(id, a);
    const lift = a * 6;
    const R = { ...r, y: r.y - lift };
    card(R, { opacity: selected ? 0.95 : 0.8, edge: selected ? P.gold : P.panelEdge });
    if (selected) k.drawRect({ pos: k.vec2(R.x, R.y), width: R.w, height: R.h, radius: 18, fill: false, outline: { width: 3, color: col(P.gold) } });

    // A live mini board with the starting position.
    const pad = R.w * 0.04;
    const S = R.w - 2 * pad;
    const o = k.vec2(R.x + pad, R.y + pad);
    drawBoard(m.def.board, o, S, { labels: false, detail: false });
    const pr = pieceRadius(m.def.board) * S;
    const drawPiece = (p: number, sprite: string) => {
      const [u, v] = pointUV(m.def.board, p);
      const c = o.add(u * S, v * S);
      k.drawEllipse({ pos: c.add(0, pr * 0.16), radiusX: pr, radiusY: pr * 0.5, color: col("#1a0d05"), opacity: 0.35 });
      k.drawSprite({ sprite, pos: c, anchor: "center", width: pr * 2, height: pr * 2 });
    };
    m.def.rules.goats.forEach((p) => drawPiece(p, "goat"));
    m.def.rules.tigers.forEach((p) => drawPiece(p, "tiger"));

    const ty = R.y + pad + S + 8;
    text(m.def.title, R.x + pad + 2, ty, { size: Math.min(20, R.w * 0.09), font: "ui-bold", color: selected ? P.gold : P.ink });
    // Badge sits on the card's top edge like a sticker: it never covers pieces or the title.
    const badge = m.trained ? "Trained AI" : "AI in training";
    const bs = Math.min(12, R.w * 0.055);
    const bw = k.formatText({ text: badge, size: bs, font: "ui-bold" }).width + 14;
    const bx = R.x + R.w - bw - 12, by = R.y - (bs + 8) / 2;
    k.drawRect({ pos: k.vec2(bx, by), width: bw, height: bs + 8, radius: (bs + 8) / 2, color: col(m.trained ? P.goatDeep : "#6b3b2a") });
    text(badge, bx + bw / 2, by + 4, { size: bs, font: "ui-bold", anchor: "top", color: P.ink });
    text(m.def.blurb, R.x + pad + 2, ty + 28, { size: Math.min(13, R.w * 0.058), color: P.inkDim, width: R.w - 2 * pad - 4, lineSpacing: -2 });
  }
}
