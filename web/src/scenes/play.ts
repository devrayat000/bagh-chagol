import type { Vec2 } from "kaplay";
import { DIFFICULTIES, type AiClient, type Difficulty } from "../ai/client";
import { cellSize, drawBoard, pieceRadius, pointUV } from "../art/board";
import { PALETTE as P } from "../art/palette";
import { drawScenery } from "../art/scenery";
import { col, k } from "../engine";
import { Fireflies, Particles } from "../fx";
import type { MapEntry } from "../maps";
import { Game, GOAT, GOAT_SIDE, State, TIGER, TIGER_SIDE, type Side } from "../rules";
import { sfx, soundOn, toggleSound } from "../sound";
import { card, text, UI, type Rect } from "../ui";

export interface PlayArgs {
  entry: MapEntry;
  human: Side;
  difficulty: Difficulty;
  ai: AiClient;
}

interface PieceVis {
  kind: typeof TIGER | typeof GOAT;
  point: number;
  u: number; // position in board fractions (animated)
  v: number;
  lift: number; // 0 on the board .. 1 in the air
  hover: number; // eased hover amount
  scale: number;
  opacity: number;
  dying: boolean;
}

interface Layout {
  board: Vec2;
  S: number;
  panel: Rect;
  portrait: boolean;
}

const sideName = (s: Side) => (s === TIGER_SIDE ? "Tiger" : "Goats");

export function playScene({ entry, human, difficulty, ai }: PlayArgs) {
  const game = new Game(entry.def);
  const def = entry.def.board;
  const rules = entry.def.rules;
  const P_ = game.geo.points;
  const aiSide = (1 - human) as Side;
  const ui = new UI();
  const particles = new Particles();
  const fireflies = new Fireflies();

  let state = game.initial();
  let history: State[] = [];
  let moves: number[] = []; // moves[i] was played from history[i]
  let pieces: PieceVis[] = [];
  let selected: number | null = null;
  let lastMove: { from: number; to: number; over: number | null } | null = null;
  let busy = false; // a move is animating
  let thinking = false;
  let generation = 0; // bumps on undo/restart so stale AI answers are ignored
  let aiValue = 0; // AI's estimate, from the tiger's point of view
  let shownValue = 0;
  let overlay = 0; // game-over overlay fade-in, 0..1
  let resultSoundPlayed = false;
  let layout = computeLayout();

  function computeLayout(): Layout {
    const w = k.width(), h = k.height();
    const m = Math.max(10, Math.min(28, Math.min(w, h) * 0.03));
    if (w >= h * 1.05) {
      const panelW = Math.max(270, Math.min(370, w * 0.3));
      const S = Math.min(h - 2 * m, w - panelW - 3 * m);
      const x0 = (w - (S + m + panelW)) / 2;
      const y0 = (h - S) / 2;
      return { board: k.vec2(x0, y0), S, panel: { x: x0 + S + m, y: y0, w: panelW, h: S }, portrait: false };
    }
    const panelH = Math.max(200, Math.min(260, h * 0.3));
    const S = Math.min(w - 2 * m, h - panelH - 3 * m);
    const y0 = (h - (S + m + panelH)) / 2;
    const pw = Math.min(w - 2 * m, Math.max(S, 360));
    return { board: k.vec2((w - S) / 2, y0), S, panel: { x: (w - pw) / 2, y: y0 + S + m, w: pw, h: panelH }, portrait: true };
  }

  // ----- geometry helpers ------------------------------------------------------------------
  const toScreen = (u: number, v: number) => layout.board.add(u * layout.S, v * layout.S);
  const pointPos = (p: number) => toScreen(...pointUV(def, p));
  const radius = () => pieceRadius(def) * layout.S;

  function pointAt(pos: Vec2): number | null {
    let best: number | null = null, bestD = cellSize(def) * layout.S * 0.48;
    for (let p = 0; p < P_; p++) {
      const d = pointPos(p).dist(pos);
      if (d < bestD) [best, bestD] = [p, d];
    }
    return best;
  }

  function syncPieces() {
    pieces = [];
    state.board.forEach((x, p) => {
      if (x === TIGER || x === GOAT) {
        const [u, v] = pointUV(def, p);
        pieces.push({ kind: x as typeof TIGER, point: p, u, v, lift: 0, hover: 0, scale: 1, opacity: 1, dying: false });
      }
    });
  }

  const humanTurn = () => !busy && !thinking && !state.isTerminal() && state.toPlay === human;

  function movesFrom(p: number) {
    return state.legalActions().filter((a) => Math.floor(a / P_) === p);
  }

  // ----- playing moves ---------------------------------------------------------------------
  function animateMove(prev: State, action: number): Promise<void> {
    const from = Math.floor(action / P_), to = action % P_;
    const capture = prev.isCapture(action);
    const over = capture ? game.geo.jumpOver.get(action)! : null;
    const piece = pieces.find((p) => p.point === from && !p.dying)!;
    const victim = over !== null ? pieces.find((p) => p.point === over && !p.dying)! : null;
    const [u0, v0] = [piece.u, piece.v];
    const [u1, v1] = pointUV(def, to);
    let struck = false;
    pieces = [...pieces.filter((p) => p !== piece), piece]; // draw the mover on top

    return new Promise((resolve) => {
      k.tween(0, 1, capture ? 0.55 : 0.3, (t) => {
        piece.u = u0 + (u1 - u0) * t;
        piece.v = v0 + (v1 - v0) * t;
        piece.lift = Math.sin(Math.PI * t) * (capture ? 1 : 0.35);
        if (victim && !struck && t >= 0.5) {
          struck = true;
          strike(victim);
        }
      }, k.easings.easeInOutCubic).onEnd(() => {
        piece.point = to;
        piece.lift = 0;
        if (!capture) sfx.move();
        particles.ring(pointPos(to).x, pointPos(to).y, radius() * 1.05, "#fff1c4");
        resolve();
      }); // prettier-ignore
    });
  }

  function strike(victim: PieceVis) {
    victim.dying = true;
    const pos = toScreen(victim.u, victim.v);
    const r = radius();
    sfx.capture();
    k.shake(r * 0.12);
    particles.burst(pos.x, pos.y, r, "tuft", 26, ["#fffdf6", "#efe4cc", "#d9c6a5"]);
    particles.burst(pos.x, pos.y, r, "spark", 12, [P.danger, P.marigold]);
    particles.ring(pos.x, pos.y, r * 1.3, P.danger);
    k.tween(0, 1, 0.4, (t) => {
      victim.scale = 1 + 0.3 * Math.sin(t * Math.PI * 0.5) - t * t * 1.3;
      victim.opacity = 1 - t;
    }, k.easings.easeOutQuad).onEnd(() => (pieces = pieces.filter((p) => p !== victim))); // prettier-ignore
  }

  async function play(action: number) {
    const prev = state;
    history.push(prev);
    moves.push(action);
    state = prev.apply(action);
    selected = null;
    const from = Math.floor(action / P_), to = action % P_;
    lastMove = { from, to, over: prev.isCapture(action) ? game.geo.jumpOver.get(action)! : null };
    busy = true;
    const gen = generation;
    await animateMove(prev, action);
    if (gen !== generation) return;
    busy = false;
    next();
  }

  function next() {
    if (state.isTerminal()) return;
    if (state.toPlay === aiSide) void aiTurn();
  }

  async function aiTurn() {
    const gen = generation;
    thinking = true;
    const started = k.time();
    const move = await ai.think(state, difficulty);
    const remaining = 0.5 - (k.time() - started); // never answer instantly: it feels unnatural
    if (remaining > 0) await new Promise((r) => k.wait(remaining, () => r(null)));
    if (gen !== generation) return;
    thinking = false;
    aiValue = aiSide === TIGER_SIDE ? move.value : -move.value;
    await play(move.action);
  }

  function reset(to: State, hist: State[]) {
    generation++;
    ai.cancelAll();
    state = to;
    history = hist;
    moves = moves.slice(0, hist.length);
    selected = null;
    lastMove = null;
    busy = thinking = false;
    overlay = 0;
    resultSoundPlayed = false;
    syncPieces();
    next();
  }

  function undo() {
    if (!history.length || busy) return;
    const hist = [...history];
    let s = hist.pop()!;
    while (hist.length && s.toPlay !== human) s = hist.pop()!;
    reset(s, hist);
  }

  const restart = () => reset(game.initial(), []);

  // ----- input -------------------------------------------------------------------------------
  k.onMousePress((btn) => {
    if (btn !== "left") return;
    const m = k.mousePos();
    if (ui.click(m.x, m.y)) return;
    if (!humanTurn()) return;
    const p = pointAt(m);
    if (p === null) return void (selected = null);

    if (selected !== null) {
      const action = movesFrom(selected).find((a) => a % P_ === p);
      if (action !== undefined) return void play(action);
    }
    if (movesFrom(p).length) {
      selected = selected === p ? null : p;
      sfx.select();
      return;
    }
    // Clicking an empty point that exactly one piece can reach: just move there.
    const reach = state.legalActions().filter((a) => a % P_ === p);
    if (reach.length === 1) return void play(reach[0]);
    if (state.board[p] !== 0) sfx.invalid();
    selected = null;
  });

  k.onKeyPress("u", undo);
  k.onKeyPress("r", restart);
  k.onKeyPress("escape", () => (selected = null));
  k.onResize(() => (layout = computeLayout()));

  k.onUpdate(() => {
    const dt = k.dt();
    layout = computeLayout();
    particles.update(dt, radius());
    shownValue += (aiValue - shownValue) * Math.min(1, dt * 4);
    const hovered = humanTurn() ? pointAt(k.mousePos()) : null;
    for (const pc of pieces) {
      const target = (pc.point === hovered && movesFrom(pc.point).length) || pc.point === selected ? 1 : 0;
      pc.hover += (target - pc.hover) * Math.min(1, dt * 12);
    }
    if (state.isTerminal() && !busy) {
      overlay = Math.min(1, overlay + dt * 2.5);
      if (!resultSoundPlayed) {
        resultSoundPlayed = true;
        const w = state.winner();
        if (w === "draw") sfx.draw();
        else if (w === human) {
          sfx.win();
          const c = layout.board.add(layout.S / 2, layout.S / 3);
          particles.burst(c.x, c.y, radius(), "confetti", 90, [P.marigold, P.madder, "#5b7bd5", P.goat, "#fff1c4"]);
        } else sfx.lose();
      }
    }
  });

  // ----- drawing -------------------------------------------------------------------------------
  k.onDraw(() => {
    ui.beginFrame();
    const w = k.width(), h = k.height();
    drawScenery(w, h);
    fireflies.draw(w, h);
    drawBoard(def, layout.board, layout.S);
    drawMarks();
    drawPieces();
    particles.draw();
    drawPanel();
    if (overlay > 0) drawGameOver();
    ui.endFrame();
  });

  function drawMarks() {
    const r = radius();
    const t = k.time();
    // Last move: a faint trail and a ring where the piece came from.
    if (lastMove && !busy) {
      const pts = [pointPos(lastMove.from), ...(lastMove.over !== null ? [pointPos(lastMove.over)] : []), pointPos(lastMove.to)];
      k.drawLines({ pts, width: r * 0.16, color: col(P.marigold), opacity: 0.35, cap: "round", join: "round" });
      k.drawCircle({ pos: pointPos(lastMove.from), radius: r * 0.45, fill: false, outline: { width: r * 0.08, color: col(P.marigold) }, opacity: 0.55 });
      if (lastMove.over !== null) {
        const o = pointPos(lastMove.over);
        k.drawLine({ p1: o.add(-r * 0.3, -r * 0.3), p2: o.add(r * 0.3, r * 0.3), width: r * 0.12, color: col(P.danger), opacity: 0.7 });
        k.drawLine({ p1: o.add(r * 0.3, -r * 0.3), p2: o.add(-r * 0.3, r * 0.3), width: r * 0.12, color: col(P.danger), opacity: 0.7 });
      }
    }
    if (!humanTurn()) return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);

    // Goats the tiger could capture right now, as a warning for the goat player.
    if (human === GOAT_SIDE) {
      const tigerView = new State(game, state.board, TIGER_SIDE, state.captures, state.ply);
      for (const a of tigerView.legalActions()) {
        if (!tigerView.isCapture(a)) continue;
        const pos = pointPos(game.geo.jumpOver.get(a)!);
        k.drawCircle({ pos, radius: r * (1.25 + 0.08 * pulse), gradient: [col(P.danger), col(P.danger)], opacity: 0.18 + 0.12 * pulse });
      }
    }

    if (selected === null) {
      // Pieces that can move get a soft golden halo.
      const movable = new Set(state.legalActions().map((a) => Math.floor(a / P_)));
      for (const p of movable) k.drawCircle({ pos: pointPos(p), radius: r * 1.14, fill: false, outline: { width: r * 0.07, color: col(P.gold) }, opacity: 0.25 + 0.25 * pulse });
      return;
    }
    // Selected piece and where it can go.
    const sp = pointPos(selected);
    k.drawCircle({ pos: sp, radius: r * 1.5, gradient: [col("#ffe7a0"), col(P.gold)], opacity: 0.18 });
    k.drawCircle({ pos: sp, radius: r * 1.16, fill: false, outline: { width: r * 0.1, color: col(P.gold) } });
    const hoverP = pointAt(k.mousePos());
    for (const a of movesFrom(selected)) {
      const to = a % P_;
      const pos = pointPos(to);
      const hot = hoverP === to;
      if (state.isCapture(a)) {
        const victim = pointPos(game.geo.jumpOver.get(a)!);
        k.drawCircle({ pos: victim, radius: r * 1.12, fill: false, outline: { width: r * (hot ? 0.16 : 0.1), color: col(P.danger) }, opacity: 0.6 + 0.4 * pulse });
        k.drawCircle({ pos, radius: r * (0.95 + 0.1 * pulse), color: col(P.danger), opacity: 0.18 });
        k.drawCircle({ pos, radius: r * (hot ? 0.6 : 0.45 + 0.06 * pulse), color: col(P.danger), opacity: hot ? 0.95 : 0.8 });
        k.drawCircle({ pos, radius: r * 0.75, fill: false, outline: { width: r * 0.07, color: col("#ffd0c8") }, opacity: 0.8 });
      } else {
        k.drawCircle({ pos, radius: r * (0.95 + 0.1 * pulse), color: col(P.gold), opacity: hot ? 0.35 : 0.2 });
        k.drawCircle({ pos, radius: r * (hot ? 0.55 : 0.42 + 0.05 * pulse), color: col(P.gold), opacity: 0.95 });
        k.drawCircle({ pos, radius: r * 0.75, fill: false, outline: { width: r * 0.06, color: col("#fff1c4") }, opacity: 0.85 });
      }
    }
  }

  function drawPieces() {
    const r = radius();
    const t = k.time();
    for (const pc of pieces) {
      const bob = pc.point === selected ? Math.sin(t * 5) * 0.06 : 0;
      const lift = Math.max(pc.lift, pc.hover * 0.28 + bob);
      const base = toScreen(pc.u, pc.v);
      const s = pc.scale * (1 + lift * 0.14);
      if (s <= 0.01) continue;
      k.drawEllipse({ pos: base.add(0, r * (0.16 + lift * 0.35)), radiusX: r * s * (1 - lift * 0.15), radiusY: r * s * 0.5 * (1 - lift * 0.15),
                      color: col("#1a0d05"), opacity: pc.opacity * (0.38 - lift * 0.15) }); // prettier-ignore
      k.drawSprite({ sprite: pc.kind === TIGER ? "tiger" : "goat", pos: base.add(0, -lift * r * 0.55), anchor: "center",
                     width: 2 * r * s, height: 2 * r * s, opacity: pc.opacity }); // prettier-ignore
    }
  }

  // ----- side panel --------------------------------------------------------------------------
  function drawPanel() {
    const R = layout.panel;
    card(R, { opacity: 0.96 });
    const pad = Math.min(22, R.w * 0.06);
    const x = R.x + pad, wIn = R.w - 2 * pad;
    const compact = layout.portrait;
    const f = compact ? 0.85 : 1;
    let y = R.y + pad * 0.8;

    if (!compact) {
      text(entry.def.title, x, y, { size: 26, font: "ui-bold", color: P.gold });
      y += 32;
      text(`Tiger wins with ${rules.capturesToWin} capture${rules.capturesToWin > 1 ? "s" : ""} · draw after ${rules.maxPlies} moves`, x, y, { size: 14, color: P.inkDim, width: wIn });
      y += 30;
    }

    // Whose turn.
    const turnH = 74 * f;
    drawTurnCard({ x, y, w: wIn, h: turnH });
    y += turnH + 14 * f;

    const colW = compact ? (wIn - 16) / 2 : wIn;
    drawCaptures({ x, y, w: colW, h: 60 * f });
    if (!compact) y += 72;
    drawMeter({ x: compact ? x + colW + 16 : x, y, w: colW, h: 60 * f });
    y += compact ? 64 : 72;

    if (!compact) {
      text(`Move ${state.ply} of ${rules.maxPlies}  ·  ${difficulty.label} AI`, x, y, { size: 14, color: P.inkDim });
      y += 22;
      if (!entry.trained) {
        text("This map's network is still training: the AI uses search only.", x, y, { size: 13, color: "#d49a7a", width: wIn });
        y += 38;
      }
      const logBottom = R.y + R.h - pad * 0.8 - 2 * 42 - 10 - 14;
      drawMoveLog({ x, y: y + 6, w: wIn, h: logBottom - y - 6 });
    }

    // Buttons along the bottom.
    const bh = compact ? 38 : 42, gap = 10;
    const by = R.y + R.h - pad * 0.8 - (compact ? bh : 2 * bh + gap);
    const cols = compact ? 4 : 2;
    const bw = (wIn - gap * (cols - 1)) / cols;
    const btn = (i: number, label: string, onClick: () => void, disabled = false) => {
      const row = Math.floor(i / cols), c = i % cols;
      ui.button({ x: x + c * (bw + gap), y: by + row * (bh + gap), w: bw, h: bh }, { label, onClick, disabled, size: compact ? 16 : 18 });
    };
    btn(0, "Undo", undo, !history.length || busy);
    btn(1, "Restart", restart);
    btn(2, "Menu", () => {
      generation++;
      ai.cancelAll();
      k.go("menu");
    });
    btn(3, soundOn ? "Sound on" : "Sound off", toggleSound);
  }

  /** The game so far, newest at the bottom, in the board's own point names. */
  function drawMoveLog(r: Rect) {
    if (r.h < 40) return;
    k.drawRect({ pos: k.vec2(r.x, r.y), width: r.w, height: r.h, radius: 12, color: col("#000000"), opacity: 0.18 });
    const rowH = 24, icon = 18;
    const rows = Math.floor((r.h - 12) / rowH);
    const first = Math.max(0, moves.length - rows);
    if (!moves.length) text("Moves will appear here.", r.x + 12, r.y + 10, { size: 14, color: P.inkDim, opacity: 0.7 });
    for (let i = first; i < moves.length; i++) {
      const a = moves[i], before = history[i];
      const from = def.labels[Math.floor(a / P_)], to = def.labels[a % P_];
      const capture = before.isCapture(a);
      const yy = r.y + 8 + (i - first) * rowH;
      const side = before.toPlay;
      text(`${i + 1}.`, r.x + 30, yy + 2, { size: 14, color: P.inkDim, anchor: "topright" });
      k.drawSprite({ sprite: side === TIGER_SIDE ? "tiger" : "goat", pos: k.vec2(r.x + 46, yy + rowH / 2 - 1), anchor: "center", width: icon, height: icon });
      text(`${from} ${capture ? "x" : "-"} ${to}`, r.x + 62, yy + 1, { size: 15, font: "ui-bold", color: capture ? "#ff9d8f" : P.ink });
      text(side === human ? "you" : "AI", r.x + r.w - 12, yy + 2, { size: 13, color: P.inkDim, anchor: "topright" });
    }
  }

  function drawTurnCard(r: Rect) {
    k.drawRect({ pos: k.vec2(r.x, r.y), width: r.w, height: r.h, radius: 14, color: col("#ffffff"), opacity: 0.05 });
    const side = state.toPlay;
    const icon = r.h * 0.78;
    const c = k.vec2(r.x + r.h * 0.55, r.y + r.h / 2);
    const glow = 0.5 + 0.5 * Math.sin(k.time() * 3);
    if (!state.isTerminal()) k.drawCircle({ pos: c, radius: icon * 0.62, color: col(side === TIGER_SIDE ? P.tiger : P.goat), opacity: 0.18 + 0.15 * glow });
    k.drawSprite({ sprite: side === TIGER_SIDE ? "tiger" : "goat", pos: c, anchor: "center", width: icon, height: icon });
    const tx = r.x + r.h * 1.1;
    let title: string, sub: string;
    if (state.isTerminal()) [title, sub] = ["Game over", ""];
    else if (side === human) {
      title = "Your move";
      sub = selected === null ? `Pick a ${human === TIGER_SIDE ? "tiger" : "goat"} that can move.` : "Now choose a glowing point.";
    } else {
      title = `${sideName(side)} ${side === TIGER_SIDE ? "is" : "are"} thinking` + ".".repeat(1 + (Math.floor(k.time() * 3) % 3));
      sub = "";
    }
    const size = Math.min(24, r.h * 0.33);
    text(title, tx, r.y + r.h * (sub ? 0.18 : 0.32), { size, font: "ui-bold" });
    if (sub) text(sub, tx, r.y + r.h * 0.18 + size * 1.15, { size: size * 0.62, color: P.inkDim, width: r.x + r.w - tx - 8 });
  }

  function drawCaptures(r: Rect) {
    const K = rules.capturesToWin;
    text("Goats captured", r.x, r.y, { size: 14, color: P.inkDim });
    text(`${state.captures} / ${K}`, r.x + r.w, r.y, { size: 14, color: state.captures ? P.danger : P.inkDim, anchor: "topright" });
    const slot = Math.min(34, (r.w - 6 * (K - 1)) / K);
    for (let i = 0; i < K; i++) {
      const c = k.vec2(r.x + slot / 2 + i * (slot + 6), r.y + 22 + slot / 2);
      k.drawCircle({ pos: c, radius: slot / 2, color: col("#000000"), opacity: 0.25 });
      if (i < state.captures) {
        k.drawSprite({ sprite: "goat", pos: c, anchor: "center", width: slot * 0.9, height: slot * 0.9, opacity: 0.55 });
        k.drawLine({ p1: c.add(-slot * 0.32, -slot * 0.32), p2: c.add(slot * 0.32, slot * 0.32), width: 3, color: col(P.danger) });
      } else {
        k.drawCircle({ pos: c, radius: slot / 2, fill: false, outline: { width: 1.5, color: col(P.panelEdge) } });
      }
    }
  }

  function drawMeter(r: Rect) {
    text("Who's ahead? (AI's view)", r.x, r.y, { size: 14, color: P.inkDim });
    const y = r.y + 30, bh = 14, icon = 26;
    const x0 = r.x + icon + 6, bw = r.w - 2 * (icon + 6);
    const p = (shownValue + 1) / 2; // tiger's share
    k.drawSprite({ sprite: "tiger", pos: k.vec2(r.x + icon / 2, y + bh / 2), anchor: "center", width: icon, height: icon });
    k.drawSprite({ sprite: "goat", pos: k.vec2(r.x + r.w - icon / 2, y + bh / 2), anchor: "center", width: icon, height: icon });
    k.drawRect({ pos: k.vec2(x0, y), width: bw, height: bh, radius: bh / 2, color: col(P.goatDeep) });
    k.drawRect({ pos: k.vec2(x0, y), width: Math.max(bh, bw * p), height: bh, radius: bh / 2, color: col(P.tiger) });
    k.drawCircle({ pos: k.vec2(x0 + bw * p, y + bh / 2), radius: bh * 0.75, color: col("#fff1c4") });
    k.drawLine({ p1: k.vec2(x0 + bw / 2, y - 3), p2: k.vec2(x0 + bw / 2, y + bh + 3), width: 1.5, color: col("#ffffff"), opacity: 0.35 });
  }

  // ----- game over ---------------------------------------------------------------------------
  function drawGameOver() {
    const w = k.width(), h = k.height();
    const e = k.easings.easeOutBack(overlay);
    k.drawRect({ pos: k.vec2(0, 0), width: w, height: h, color: col("#08060f"), opacity: 0.55 * overlay });
    const winner = state.winner()!;
    let title: string, color: string;
    if (winner === "draw") [title, color] = ["Draw", P.ink];
    else if (winner === human) [title, color] = ["You win!", P.gold];
    else [title, color] = ["You lost", "#f08a7a"];
    let reason: string;
    if (winner === "draw") reason = `No one won within ${rules.maxPlies} moves.`;
    else if (winner === TIGER_SIDE)
      reason = state.captures >= rules.capturesToWin ? `The tiger captured ${state.captures} goat${state.captures > 1 ? "s" : ""}.` : "The goats have no moves left.";
    else reason = "The tiger is trapped!";

    const cw = Math.min(440, w - 40), ch = 300;
    const R = { x: (w - cw) / 2, y: (h - ch) / 2 + (1 - e) * 40, w: cw, h: ch };
    k.pushTransform();
    k.pushTranslate(w / 2, h / 2);
    k.pushScale(0.9 + 0.1 * e, 0.9 + 0.1 * e);
    k.pushTranslate(-w / 2, -h / 2);
    card(R, { opacity: 0.97 * overlay });
    const icon = 92;
    const winnerSprite = winner === "draw" ? null : winner === TIGER_SIDE ? "tiger" : "goat";
    const ic = k.vec2(w / 2, R.y + 66);
    if (winnerSprite) {
      k.drawCircle({ pos: ic, radius: icon * 0.7, gradient: [col("#ffe7a0"), col(P.panel)], opacity: 0.35 * overlay });
      k.drawSprite({ sprite: winnerSprite, pos: ic, anchor: "center", width: icon, height: icon, opacity: overlay });
    } else {
      k.drawSprite({ sprite: "tiger", pos: ic.add(-30, 0), anchor: "center", width: icon * 0.8, height: icon * 0.8, opacity: overlay });
      k.drawSprite({ sprite: "goat", pos: ic.add(30, 0), anchor: "center", width: icon * 0.8, height: icon * 0.8, opacity: overlay });
    }
    text(title, w / 2, R.y + 128, { size: 40, font: "ui-bold", color, anchor: "top", opacity: overlay });
    text(reason, w / 2, R.y + 178, { size: 17, color: P.inkDim, anchor: "top", opacity: overlay });
    const bw = (cw - 3 * 16) / 3, by = R.y + ch - 64;
    if (overlay > 0.6) {
      ui.button({ x: R.x + 16, y: by, w: bw, h: 46 }, { label: "Play again", style: "primary", onClick: restart, size: 17 });
      ui.button({ x: R.x + 32 + bw, y: by, w: bw, h: 46 }, {
        label: `Play ${human === TIGER_SIDE ? "goats" : "tiger"}`, size: 17,
        onClick: () => k.go("play", { entry, human: (1 - human) as Side, difficulty, ai } satisfies PlayArgs),
      }); // prettier-ignore
      ui.button({ x: R.x + 48 + 2 * bw, y: by, w: bw, h: 46 }, { label: "Menu", size: 17, onClick: () => k.go("menu") });
    }
    k.popTransform();
  }

  syncPieces();
  next();

  // Hooks for automated UI tests (screenshots / click-throughs).
  (window as unknown as { bagh: object }).bagh = {
    point: (p: number) => pointPos(p),
    state: () => state.toJSON(),
    legal: () => state.legalActions(),
    over: () => state.isTerminal(),
    points: P_,
  };
}

export { DIFFICULTIES };
