import type { Vec2 } from "kaplay";
import type { AiClient, Difficulty } from "../ai/client";
import { AI_AVATARS, AVATAR_NAMES, AVATAR_VOICE, drawFit, type Avatar } from "../art/crew";
import { col, k } from "../engine";
import { Particles } from "../fx";
import type { FourRowEntry } from "../maps";
import { share } from "../share";
import { crewSound, sfx } from "../sound";
import { card, text, UI, type Rect } from "../ui";
import { cellCenter, drawBoardBack, drawBoardFront, drawDay, drawDisc, FR, holeRadius, pad, sideName, type BoardGeom } from "./art";
import { FourRowState, type Side } from "./rules";
import { CrewParticles, drawHelp, drawTitle, drawTopBar } from "./widgets";

export interface FourRowPlayArgs {
  entry: FourRowEntry;
  avatar: Avatar;
  human: Side;
  difficulty: Difficulty;
  ai: AiClient;
}

interface Layout {
  g: BoardGeom;
  panel: Rect;
  portrait: boolean;
}

/** The disc that is falling right now. */
interface Drop {
  cell: number;
  side: Side;
  y: number; // current centre height, in pixels relative to the board's top
  squash: number;
}

export function fourRowPlayScene({ entry, avatar, human, difficulty, ai }: FourRowPlayArgs) {
  const def = entry.def;
  const aiSide = (1 - human) as Side;
  const aiAvatar: Avatar = AI_AVATARS[difficulty.id];
  const avatarOf = (s: Side): Avatar => (s === human ? avatar : aiAvatar);
  const nameOf = (s: Side) => (s === human ? "You" : AVATAR_NAMES[aiAvatar]);
  const ui = new UI({ crewCursor: true });
  const sparkles = new CrewParticles();
  const confetti = new Particles();

  let state = FourRowState.initial(def);
  let history: FourRowState[] = [];
  let drop: Drop | null = null;
  let thinking = false;
  let generation = 0; // bumps on undo/restart so stale AI answers are ignored
  let aiValue = 0; // the AI's estimate, from the human's point of view (+1 = human winning)
  let shownValue = 0;
  let mood: string | null = null; // crew emoji showing how the AI feels
  let hoverCol: number | null = null;
  let glow = 0;
  let overlay = 0, overlayOpen = false, overlayClosed = false;
  let help = 0, helpOpen = false;
  let resultShown = false;
  let layout = computeLayout();

  function computeLayout(): Layout {
    const w = k.width(), h = k.height();
    const m = Math.max(10, Math.min(24, Math.min(w, h) * 0.03));
    const top = 66; // the round buttons along the top
    const cellsW = def.cols + 0.6, cellsH = def.rows + 1 + 1.1; // + a row for the disc above, + feet
    if (w >= h * 1.1) {
      const pw = Math.max(280, Math.min(360, w * 0.3));
      const cell = Math.min((w - pw - 3 * m) / cellsW, (h - top - m) / cellsH);
      const bw = def.cols * cell;
      const x0 = (w - (bw + 2 * m + pw + cell * 0.6)) / 2 + cell * 0.3;
      const y0 = top + (h - top - m - cell * cellsH) / 2 + cell;
      const panel = { x: x0 + bw + cell * 0.3 + 2 * m, y: Math.max(top, y0 - cell * 0.4), w: pw, h: Math.min(h - top - m, def.rows * cell + cell * 1.2) };
      return { g: { x: x0, y: y0, cell, rows: def.rows, cols: def.cols }, panel, portrait: false };
    }
    const ph = 196;
    const cell = Math.min((w - 2 * m) / cellsW, (h - top - ph - 2 * m) / cellsH);
    const bw = def.cols * cell;
    const y0 = top + cell + Math.max(0, (h - top - ph - 2 * m - cell * cellsH) / 2); // centred above the panel
    const pw = Math.min(w - 2 * m, 560);
    return { g: { x: (w - bw) / 2, y: y0, cell, rows: def.rows, cols: def.cols }, panel: { x: (w - pw) / 2, y: h - ph - m, w: pw, h: ph }, portrait: true };
  }

  const humanTurn = () => !drop && !thinking && !state.isTerminal() && state.toPlay === human && !helpOpen;

  /** The column under a screen position (anywhere from the row above the board to its bottom). */
  function columnAt(p: Vec2): number | null {
    const { g } = layout;
    if (p.y < g.y - g.cell * 1.2 || p.y > g.y + g.rows * g.cell + pad(g)) return null;
    const c = Math.floor((p.x - g.x) / g.cell);
    return c >= 0 && c < g.cols ? c : null;
  }

  // ----- playing moves ---------------------------------------------------------------------
  async function play(col: number) {
    if (!state.legalActions().includes(col)) return void sfx.invalid();
    const prev = state;
    const row = prev.landingRow(col);
    history.push(prev);
    state = prev.apply(col);
    const gen = generation;
    await animateDrop(state.last, prev.toPlay, row);
    if (gen !== generation) return;
    afterMove();
  }

  function animateDrop(cell: number, side: Side, row: number): Promise<void> {
    const { g } = layout;
    const d: Drop = { cell, side, y: -g.cell * 0.5, squash: 1 };
    drop = d;
    const target = (row + 0.5) * g.cell;
    const fall = Math.sqrt((target - d.y) / g.cell) * 0.16 + 0.08; // deeper drops take longer, like gravity
    return new Promise((resolve) => {
      k.tween(d.y, target, fall, (y) => (d.y = y), k.easings.easeInQuad).onEnd(() => {
        sfx.drop(row);
        // A little bounce on landing.
        k.tween(0, 1, 0.22, (t) => {
          d.y = target - Math.sin(t * Math.PI) * g.cell * 0.12 * (1 - t);
          d.squash = 1 - 0.12 * Math.sin(t * Math.PI) * (1 - t);
        }).onEnd(() => {
          if (drop === d) drop = null;
          resolve();
        }); // prettier-ignore
      });
    });
  }

  function afterMove() {
    const w = state.winner();
    if (w === null) {
      if (state.toPlay === aiSide) void aiTurn();
      return;
    }
    // Game over: sparkle along the winning line, then show the result.
    const { g } = layout;
    if (w !== "draw") {
      for (const c of state.winningCells()) {
        const p = cellCenter(g, Math.floor(c / g.cols), c % g.cols);
        sparkles.burst(p.x, p.y, g.cell * 0.5, ["crew-star", "crew-sparkles", "crew-sparkle"], 6, { speed: 3 });
      }
    }
    const gen = generation;
    k.wait(w === "draw" ? 0.4 : 1.0, () => {
      if (gen !== generation) return;
      overlayOpen = true;
      showResult();
    });
  }

  function showResult() {
    if (resultShown) return;
    resultShown = true;
    const w = state.winner();
    const { g } = layout;
    if (w === human) {
      sfx.win();
      crewSound(AVATAR_VOICE[avatar] ?? "crew-bean_voice", { detune: 300 });
      confetti.burst(k.width() / 2, k.height() * 0.3, g.cell * 0.5, "confetti", 90, [FR.red, FR.yellow, "#5b7bd5", "#7bd65a", "#ffffff"]);
      sparkles.burst(k.width() / 2, k.height() * 0.35, g.cell * 0.6, ["crew-heart", "crew-star", "crew-coin"], 24, { speed: 6, gravity: 9, life: 1.8 });
    } else if (w === "draw") sfx.draw();
    else {
      sfx.lose();
      crewSound("crew-burp", { volume: 0.5 });
    }
  }

  async function aiTurn() {
    const gen = generation;
    thinking = true;
    const started = k.time();
    const move = await ai.think(state, difficulty);
    const remaining = 0.45 - (k.time() - started); // never answer instantly: it feels unnatural
    if (remaining > 0) await new Promise((r) => k.wait(remaining, () => r(null)));
    if (gen !== generation) return;
    thinking = false;
    aiValue = -move.value;
    mood = move.value > 0.5 ? "crew-pog" : move.value < -0.5 ? "crew-beant" : move.value < -0.15 ? "crew-been" : null;
    await play(move.action);
  }

  function reset(to: FourRowState, hist: FourRowState[]) {
    generation++;
    ai.cancelAll();
    state = to;
    history = hist;
    drop = null;
    thinking = false;
    overlay = 0;
    overlayOpen = overlayClosed = resultShown = false;
    if (!hist.length) [aiValue, mood] = [0, null];
    if (state.toPlay === aiSide && !state.isTerminal()) void aiTurn();
  }

  function undo() {
    if (!history.length) return;
    const hist = [...history];
    let s = hist.pop()!;
    while (hist.length && s.toPlay !== human) s = hist.pop()!;
    if (s.toPlay !== human) return; // the AI's opening move can't be taken back
    reset(s, hist);
  }

  const restart = () => reset(FourRowState.initial(def), []);
  const toMenu = () => {
    generation++;
    ai.cancelAll();
    k.go("fourrow-menu");
  };
  const shareText = () => {
    const w = state.winner();
    const who = `${AVATAR_NAMES[aiAvatar]} (${difficulty.label} AI)`;
    if (w === human) return `I beat ${who} at Four in a Row in ${Math.ceil(state.ply / 2)} moves! Can you?`;
    if (w === "draw") return `I drew with ${who} at Four in a Row. Can you beat it?`;
    return `Can you beat ${who} at Four in a Row?`;
  };

  // ----- input -------------------------------------------------------------------------------
  k.onMousePress((btn) => {
    if (btn !== "left") return;
    const m = k.mousePos();
    if (ui.click(m.x, m.y)) return;
    if (!humanTurn()) return;
    const c = columnAt(m);
    if (c !== null) void play(c);
  });
  for (let c = 0; c < Math.min(def.cols, 9); c++) k.onKeyPress(String(c + 1) as "1", () => humanTurn() && void play(c));
  k.onKeyPress("u", undo);
  k.onKeyPress("r", restart);
  k.onKeyPress("escape", () => (helpOpen ? (helpOpen = false) : overlayOpen ? closeOverlay() : toMenu()));
  k.onResize(() => (layout = computeLayout()));

  function closeOverlay() {
    overlayOpen = false;
    overlayClosed = true;
  }

  k.onUpdate(() => {
    const dt = k.dt();
    layout = computeLayout();
    sparkles.update(dt);
    confetti.update(dt, layout.g.cell * 0.5);
    shownValue += (aiValue - shownValue) * Math.min(1, dt * 4);
    help = Math.max(0, Math.min(1, help + (helpOpen ? 1 : -1) * dt * 5));
    overlay = Math.max(0, Math.min(1, overlay + (overlayOpen ? 1 : -1) * dt * 3));
    const c = humanTurn() ? columnAt(k.mousePos()) : null;
    if (c !== hoverCol && c !== null && state.legalActions().includes(c)) sfx.tick();
    hoverCol = c;
    glow += ((c === null ? 0 : 1) - glow) * Math.min(1, dt * 12);
  });

  // ----- drawing -------------------------------------------------------------------------------
  k.onDraw(() => {
    ui.beginFrame();
    const w = k.width(), h = k.height();
    drawDay(w, h);
    drawBoard();
    sparkles.draw();
    confetti.draw();
    drawPanel();
    drawTopBar(ui, {
      back: { tooltip: "Menu", onClick: toMenu, sprite: "crew-menu" },
      onHelp: () => (helpOpen = true),
      shareText: shareText(),
    });
    if (overlay > 0) drawGameOver();
    if (help > 0) drawHelp(ui, help, () => (helpOpen = false));
    ui.endFrame();
  });

  function drawBoard() {
    const { g } = layout;
    const r = holeRadius(g) * 0.96;
    const t = k.time();
    drawBoardBack(g);
    for (let i = 0; i < def.rows * def.cols; i++) {
      const v = state.grid[i];
      if (!v || (drop && drop.cell === i)) continue;
      const p = cellCenter(g, Math.floor(i / def.cols), i % def.cols);
      drawDisc(p.x, p.y, r, (v - 1) as Side, avatarOf((v - 1) as Side));
    }
    if (drop) {
      const x = g.x + ((drop.cell % def.cols) + 0.5) * g.cell;
      drawDisc(x, g.y + drop.y, r, drop.side, avatarOf(drop.side), 1, drop.squash);
    }
    const legalHover = hoverCol !== null && state.legalActions().includes(hoverCol) ? hoverCol : null;
    drawBoardFront(g, legalHover ?? hoverCol, glow);

    // The last disc dropped gets a small marker; the winning line glows.
    const winner = state.winner();
    if (!drop && winner !== null && winner !== "draw") {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      for (const c of state.winningCells()) {
        const p = cellCenter(g, Math.floor(c / def.cols), c % def.cols);
        k.drawCircle({ pos: p, radius: r * (1.04 + 0.06 * pulse), fill: false, outline: { width: g.cell * 0.07, color: col("#ffffff") } });
      }
    } else if (!drop && state.last >= 0) {
      const p = cellCenter(g, Math.floor(state.last / def.cols), state.last % def.cols);
      k.drawCircle({ pos: p.add(0, -r * 0.82), radius: g.cell * 0.06, color: col("#ffffff"), opacity: 0.9 });
    }

    // Your next disc, hovering over the column under the mouse.
    if (humanTurn()) {
      const c = legalHover ?? null;
      const x = c !== null ? g.x + (c + 0.5) * g.cell : k.mousePos().x;
      const y = g.y - g.cell * 0.6 + Math.sin(t * 5) * g.cell * 0.05;
      const inside = x > g.x - g.cell * 0.4 && x < g.x + g.cols * g.cell + g.cell * 0.4;
      if (c !== null) {
        const row = state.landingRow(c);
        const target = cellCenter(g, row, c);
        k.drawCircle({ pos: target, radius: r * 0.9, color: col(human === 0 ? FR.red : FR.yellow), opacity: 0.25 + 0.1 * Math.sin(t * 6) });
      }
      if (inside) drawDisc(x, y, r, human, avatar, c !== null ? 1 : 0.5);
    }
  }

  // ----- side panel --------------------------------------------------------------------------
  function drawPanel() {
    const R = layout.panel;
    card(R, { color: "#fffaf0", edge: FR.boardEdge, opacity: 0.96, radius: 22 });
    const padX = 18, x = R.x + padX, wIn = R.w - 2 * padX;
    const portrait = layout.portrait;
    let y = R.y + 14;

    if (!portrait) {
      drawTitle(R.x + R.w / 2, y + 18, Math.min(30, R.w * 0.085));
      y += 46;
    }
    const rowH = portrait ? 50 : 62;
    const colW = portrait ? (wIn - 12) / 2 : wIn;
    drawPlayer({ x, y, w: colW, h: rowH }, 0);
    drawPlayer({ x: portrait ? x + colW + 12 : x, y: portrait ? y : y + rowH + 10, w: colW, h: rowH }, 1);
    y += portrait ? rowH + 10 : 2 * rowH + 22;

    drawMeter({ x, y, w: wIn, h: 40 });
    y += portrait ? 46 : 52;

    if (!portrait) {
      const status = state.isTerminal() ? "Game over" : `Move ${state.ply + 1} of ${def.rows * def.cols}`;
      text(`${status}  ·  ${difficulty.label} AI`, x, y, { size: 15, color: "#6b6390" });
      y += 24;
      if (!def.trained) {
        text("The network is still training: the AI plays by search only.", x, y, { size: 13, color: "#a0522d", width: wIn });
        y += 36;
      }
    }

    const bh = portrait ? 42 : 48;
    const by = R.y + R.h - 14 - bh;
    const showResultBtn = overlayClosed && state.isTerminal() && !portrait;
    const free = by - (showResultBtn ? bh + 10 : 0) - 10 - y;
    if (!portrait && free > 110) drawVersus({ x, y, w: wIn, h: free });
    const bw = (wIn - 10) / 2;
    ui.button({ x, y: by, w: bw, h: bh }, { label: "Undo", sprite: "crew-history-o", onClick: undo, disabled: !history.some((s) => s.toPlay === human) || drop !== null, size: 18 });
    ui.button({ x: x + bw + 10, y: by, w: bw, h: bh }, { label: state.isTerminal() ? "Play again" : "New game", style: state.isTerminal() ? "primary" : "secondary", sprite: "crew-play-o", onClick: restart, size: 18 });
    if (showResultBtn) {
      ui.button({ x, y: by - bh - 10, w: wIn, h: bh }, { label: "Show result", onClick: () => (overlayOpen = true), size: 17 });
    }
  }

  /** Your crew member facing the AI's, in the panel's spare room. The winner jumps for joy. */
  function drawVersus(r: Rect) {
    const t = k.time();
    const size = Math.min(r.h * 0.62, r.w * 0.34);
    const cy = r.y + r.h / 2;
    const winner = state.winner();
    k.drawEllipse({ pos: k.vec2(r.x + r.w / 2, cy + size * 0.55), radiusX: r.w * 0.46, radiusY: size * 0.12, color: col("#000000"), opacity: 0.08 });
    ([human, aiSide] as Side[]).forEach((side, i) => {
      const x = r.x + r.w * (i === 0 ? 0.22 : 0.78);
      let dy = 0, angle = 0, opacity = 1;
      if (winner === side) dy = -Math.abs(Math.sin(t * 6)) * size * 0.3;
      else if (winner !== null && winner !== "draw") [angle, opacity] = [i === 0 ? -80 : 80, 0.7]; // knocked over
      else if (state.toPlay === side && winner === null) dy = -Math.abs(Math.sin(t * 4)) * size * 0.08;
      drawFit(`crew-${avatarOf(side)}-o`, x, cy + size * 0.5 + dy, size, { anchor: "bot", angle, opacity, flipX: i === 1 });
      k.drawCircle({ pos: k.vec2(x, cy + size * 0.5 + 6), radius: size * 0.12, color: col(side === 0 ? FR.red : FR.yellow) });
    });
    drawTitle(r.x + r.w / 2, cy, Math.min(40, size * 0.42), "VS");
  }

  function drawPlayer(r: Rect, side: Side) {
    const t = k.time();
    const turn = !state.isTerminal() && state.toPlay === side;
    const winner = state.winner() === side;
    k.drawRect({ pos: k.vec2(r.x, r.y), width: r.w, height: r.h, radius: 14, color: col(turn || winner ? FR.gold : "#efe9ff") });
    if (turn) k.drawRect({ pos: k.vec2(r.x, r.y), width: r.w, height: r.h, radius: 14, fill: false, outline: { width: 3, color: col(FR.boardEdge) }, opacity: 0.6 + 0.4 * Math.sin(t * 5) });
    const dr = r.h * 0.38;
    const bounce = turn ? Math.abs(Math.sin(t * 4)) * r.h * 0.06 : 0;
    drawDisc(r.x + r.h * 0.5, r.y + r.h / 2 - bounce, dr, side, avatarOf(side));
    const tx = r.x + r.h + 4;
    const big = r.h > 55;
    text(nameOf(side), tx, r.y + r.h * (big ? 0.16 : 0.12), { size: big ? 19 : 16, font: "ui-bold", color: FR.ink });
    const sub = side === human ? `${sideName(side)}${side === 0 ? " · goes first" : ""}` : `${difficulty.label} AI · ${sideName(side)}`;
    text(sub, tx, r.y + r.h * (big ? 0.52 : 0.55), { size: big ? 14 : 12, color: "#6b6390" });
    // The AI's face: thinking, or how it feels about the game.
    if (side === aiSide) {
      const ex = r.x + r.w - r.h * 0.45, ey = r.y + r.h / 2;
      if (thinking) drawFit("crew-beenking", ex, ey, r.h * 0.7, { frame: Math.floor(t * 30) });
      else if (mood && !state.isTerminal()) drawFit(mood, ex, ey, r.h * 0.6, { angle: Math.sin(t * 3) * 6 });
    }
  }

  function drawMeter(r: Rect) {
    text("Who's ahead? (AI's view)", r.x, r.y, { size: 13, color: "#6b6390" });
    const y = r.y + 22, bh = 14, icon = 22;
    const x0 = r.x + icon + 6, bw = r.w - 2 * (icon + 6);
    const p = (shownValue + 1) / 2; // the human's share
    drawDisc(r.x + icon / 2, y + bh / 2, icon / 2, human, avatar);
    drawDisc(r.x + r.w - icon / 2, y + bh / 2, icon / 2, aiSide, aiAvatar);
    k.drawRect({ pos: k.vec2(x0, y), width: bw, height: bh, radius: bh / 2, color: col(human === 0 ? FR.yellow : FR.red) });
    k.drawRect({ pos: k.vec2(x0, y), width: Math.max(bh, bw * p), height: bh, radius: bh / 2, color: col(human === 0 ? FR.red : FR.yellow) });
    k.drawCircle({ pos: k.vec2(x0 + bw * p, y + bh / 2), radius: bh * 0.75, color: col("#ffffff"), outline: { width: 2, color: col(FR.boardEdge) } });
  }

  // ----- game over ---------------------------------------------------------------------------
  function drawGameOver() {
    const w = k.width(), h = k.height();
    const e = k.easings.easeOutBack(overlay);
    k.drawRect({ pos: k.vec2(0, 0), width: w, height: h, color: col("#0c0a1e"), opacity: 0.45 * overlay });
    const winner = state.winner()!;
    const won = winner === human;
    const title = winner === "draw" ? "DRAW!" : won ? "YOU WIN!" : "YOU LOST";
    const reason =
      winner === "draw" ? "The board is full and nobody made a line."
      : won ? `Four in a row in ${Math.ceil(state.ply / 2)} moves. ${AVATAR_NAMES[aiAvatar]} is impressed.`
      : `${AVATAR_NAMES[aiAvatar]} lined up four. Try again?`; // prettier-ignore

    const cw = Math.min(460, w - 32), ch = 330;
    const R = { x: (w - cw) / 2, y: (h - ch) / 2 + (1 - e) * 40, w: cw, h: ch };
    ui.area({ x: 0, y: 0, w, h }, () => {}); // block clicks to the board below
    card(R, { opacity: 0.98 * overlay, color: "#fffaf0", edge: FR.boardEdge, radius: 26 });

    const t = k.time();
    const ic = k.vec2(w / 2, R.y + 70);
    if (winner === "draw") {
      drawFit(`crew-${avatar}`, ic.x - 44, ic.y, 84, { opacity: overlay, angle: Math.sin(t * 3) * 8 });
      drawFit(`crew-${aiAvatar}`, ic.x + 44, ic.y, 84, { opacity: overlay, angle: -Math.sin(t * 3) * 8 });
    } else {
      const who = won ? avatar : aiAvatar;
      k.drawCircle({ pos: ic, radius: 62, color: col(FR.gold), opacity: 0.6 * overlay });
      drawFit(`crew-${who}-o`, ic.x, ic.y - Math.abs(Math.sin(t * 5)) * 12, 100, { opacity: overlay });
      if (won) drawFit("crew-sparkling", ic.x + 62, ic.y - 40, 46, { opacity: overlay, frame: Math.floor(t * 10) });
    }
    drawTitle(w / 2, R.y + 158, Math.min(54, cw * 0.12), title);
    text(reason, w / 2, R.y + 196, { size: 16, color: FR.ink, anchor: "top", width: cw - 48, align: "center", opacity: overlay });

    if (overlay > 0.6) {
      const by = R.y + ch - 70, gap = 10, bw = (cw - 32 - 2 * gap) / 3;
      ui.button({ x: R.x + 16, y: by, w: bw, h: 50 }, { label: "Again", style: "primary", sprite: "crew-play-o", onClick: restart, size: 18 });
      ui.button({ x: R.x + 16 + bw + gap, y: by, w: bw, h: 50 }, { label: "Share", sprite: "crew-share-o", onClick: () => void share("Four in a Row", shareText(), "fourrow"), size: 18 });
      ui.button({ x: R.x + 16 + 2 * (bw + gap), y: by, w: bw, h: 50 }, { label: "Menu", sprite: "crew-menu-o", onClick: toMenu, size: 18 });
      const s = 42;
      ui.iconButton({ x: R.x + R.w - s - 12, y: R.y + 12, w: s, h: s }, "crew-cross_mark", closeOverlay, { tooltip: "Look at the board" });
    }
  }

  if (state.toPlay === aiSide) void aiTurn();

  // Hooks for automated UI tests (screenshots / click-throughs).
  (window as unknown as { fourrow: object }).fourrow = {
    column: (c: number) => cellCenter(layout.g, 0, c),
    state: () => state.toJSON(),
    over: () => state.isTerminal(),
    thinking: () => thinking || drop !== null,
  };
}
