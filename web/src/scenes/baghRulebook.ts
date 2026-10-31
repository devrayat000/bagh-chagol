// The Bagh-Chagol rulebook. Every animation is played on the board you chose,
// with positions worked out from its own lines (steps and jumps), and the
// numbers in the text (captures to win, move limit, who starts) are that map's.

import type { Vec2 } from "kaplay";
import { drawFit } from "../art/crew";
import { drawBoard, pieceRadius, pointUV } from "../art/board";
import { PALETTE as P } from "../art/palette";
import { col, k } from "../engine";
import { burst, caption, dashedArrow, Rulebook, span, stamp, type BookTheme, type RulePage } from "../rulebook";
import type { MapDef } from "../rules";
import type { Rect } from "../ui";

const THEME: BookTheme = {
  cover: P.indigo,
  coverEdge: P.marigold,
  paper: P.clothLight,
  paperShade: P.clothDark,
  ink: "#3b2414",
  inkDim: "#9a7a58",
  accent: P.madder,
  titleFont: "ui-bold",
  titleColors: [P.madder, P.indigo],
  styles: { tiger: P.tigerDeep, goat: P.goatDeep, hi: P.madder, bad: "#c0392b" },
  // The tiger and a goat peek over the top of the book.
  mascot: (x, y, size, t) => {
    k.drawSprite({ sprite: "tiger", pos: k.vec2(x - size * 0.55, y - size * 0.32 + Math.sin(t * 2) * 3), anchor: "center", width: size, height: size });
    k.drawSprite({ sprite: "goat", pos: k.vec2(x + size * 0.45, y - size * 0.3 + Math.sin(t * 2 + 1.5) * 3), anchor: "center", width: size * 0.9, height: size * 0.9 });
  },
};

type Kind = "tiger" | "goat";

export function baghRulebook(map: () => MapDef, onClose?: () => void) {
  const pages = (): RulePage[] => {
    const M = map(), B = M.board, R = M.rules;
    const P_ = B.coords.length;
    const dist = (p: number) => Math.hypot(pointUV(B, p)[0] - 0.5, pointUV(B, p)[1] - 0.5);
    const byCentre = [...Array(P_).keys()].sort((a, b) => dist(a) - dist(b));

    // Positions for the animations, found from the board's own geometry.
    const stepFrom = byCentre.find((p) => B.steps[p].length >= 2) ?? byCentre[0];
    const jumper = byCentre.find((p) => B.jumps[p].length > 0)!;
    const [over, land] = B.jumps[jumper][0];
    // The point where a tiger is trapped by the fewest goats (usually a corner).
    const trapNeeds = (p: number) => [...new Set([...B.steps[p], ...B.jumps[p].map(([, l]) => l)])];
    const trapAt = [...Array(P_).keys()].filter((p) => B.steps[p].length).sort((a, b) => trapNeeds(a).length - trapNeeds(b).length || dist(b) - dist(a))[0];
    const trapGoats = trapNeeds(trapAt);
    // Two separate pairs of neighbouring points, for the pieces pacing back and forth.
    const ta = byCentre[0], tb = B.steps[ta][0];
    const ga = byCentre.find((p) => p !== ta && p !== tb && !B.steps[ta].includes(p) && B.steps[p].some((q) => q !== ta && q !== tb)) ?? byCentre[1];
    const gb = B.steps[ga].find((q) => q !== ta && q !== tb) ?? B.steps[ga][0];

    const nT = R.tigers.length, nG = R.goats.length, K = R.capturesToWin;
    const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
    const goatsFirst = R.first === "goat";

    /** Where the board goes inside the stage, leaving room for a caption below. */
    function stage(r: Rect) {
      const S = Math.min(r.w, r.h - 34);
      const o = k.vec2(r.x + (r.w - S) / 2, r.y);
      const at = (p: number) => o.add(pointUV(B, p)[0] * S, pointUV(B, p)[1] * S);
      return { o, S, at, rad: pieceRadius(B) * S, cap: r.y + r.h - 14, cx: r.x + r.w / 2 };
    }

    function piece(kind: Kind, pos: Vec2, rad: number, o: { lift?: number; scale?: number; opacity?: number; angle?: number } = {}) {
      const lift = o.lift ?? 0, s = (o.scale ?? 1) * (1 + lift * 0.15), op = o.opacity ?? 1;
      if (s <= 0.01) return;
      k.drawEllipse({ pos: pos.add(0, rad * (0.16 + lift * 0.4)), radiusX: rad * s, radiusY: rad * s * 0.5, color: col("#1a0d05"), opacity: op * (0.35 - lift * 0.12) });
      k.drawSprite({ sprite: kind, pos: pos.add(0, -lift * rad * 0.7), anchor: "center", width: 2 * rad * s, height: 2 * rad * s, opacity: op, angle: o.angle ?? 0 });
    }

    const lerp = (a: Vec2, b: Vec2, t: number) => a.add(b.sub(a).scale(t));
    const glowDot = (pos: Vec2, rad: number, t: number, color = P.gold) => {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      k.drawCircle({ pos, radius: rad * (0.55 + 0.1 * pulse), color: col(color), opacity: 0.85 });
      k.drawCircle({ pos, radius: rad * 0.85, fill: false, outline: { width: 3, color: col("#fff1c4") }, opacity: 0.6 + 0.4 * pulse });
    };

    return [
      {
        title: "The board",
        body: `${plural(nT, "[tiger]tiger")}[/tiger] against ${plural(nG, "[goat]goat")}[/goat]. Pieces stand on the points and move [hi]along the lines[/hi].\n\nOn this board the [hi]${goatsFirst ? "goats" : "tiger"} move${goatsFirst ? "" : "s"} first[/hi]; then the sides take turns, one move each.`,
        loop: 5,
        demo: (r, t) => {
          const st = stage(r);
          drawBoard(B, st.o, st.S, { labels: false, detail: false });
          // Sparks running along every line: this is where pieces can go.
          B.lines.forEach((line, i) => {
            const u = ((t * 0.5 + i * 0.37) % 1) * (line.length - 1);
            const a = Math.floor(u), f = u - a;
            if (a + 1 < line.length) k.drawCircle({ pos: lerp(st.at(line[a]), st.at(line[a + 1]), f), radius: st.S * 0.012, color: col(P.marigold), opacity: 0.9 });
          });
          const all: [Kind, number][] = [...R.goats.map((p) => ["goat", p] as [Kind, number]), ...R.tigers.map((p) => ["tiger", p] as [Kind, number])];
          all.forEach(([kind, p], i) => {
            const e = span(t, 0.2 + i * 0.12, 0.4, k.easings.easeOutBack);
            if (e > 0) piece(kind, st.at(p).add(0, -(1 - e) * st.S * 0.15), st.rad, { opacity: Math.min(1, e * 2) });
          });
          if (t > 0.4 + all.length * 0.12) {
            const who: Kind = goatsFirst ? "goat" : "tiger";
            k.drawSprite({ sprite: who, pos: k.vec2(st.cx - 70, st.cap), anchor: "center", width: 26, height: 26, angle: Math.sin(t * 5) * 10 });
            caption(`${goatsFirst ? "goats" : "tiger"} first!`, st.cx + 6, st.cap, P.madder);
          }
        },
      },
      {
        title: "Goats step",
        body: "A [goat]goat[/goat] moves [hi]one step[/hi] along a line, to an empty point right next to it.\n\nGoats can't jump and can't capture. Their strength is [hi]teamwork[/hi]: together they fence the tiger in.",
        loop: 1.5 * B.steps[stepFrom].length,
        demo: (r, t) => {
          const st = stage(r);
          drawBoard(B, st.o, st.S, { labels: false, detail: false });
          const nbrs = B.steps[stepFrom], i = Math.floor(t / 1.5) % nbrs.length, lt = t % 1.5;
          for (const q of nbrs) glowDot(st.at(q), st.rad, t, q === nbrs[i] ? P.gold : "#e9d8a6");
          const there = span(lt, 0.45, 0.4, k.easings.easeInOutCubic) - span(lt, 1.05, 0.35, k.easings.easeInOutCubic);
          piece("goat", lerp(st.at(stepFrom), st.at(nbrs[i]), there), st.rad, { lift: Math.sin(there * Math.PI) * 0.35 });
          caption("one step, any line", st.cx, st.cap, P.goatDeep);
        },
      },
      {
        title: "The tiger jumps",
        body: "The [tiger]tiger[/tiger] can step like a goat, or [hi]jump over a goat[/hi] next to it, in a straight line, onto the [hi]empty point just behind[/hi].\n\nThe goat it jumps over is [bad]captured[/bad] and leaves the board. The tiger can only jump one goat per move.",
        loop: 3.4,
        demo: (r, t) => {
          const st = stage(r);
          drawBoard(B, st.o, st.S, { labels: false, detail: false });
          const F = st.at(jumper), O = st.at(over), L = st.at(land);
          if (t < 1.0) {
            dashedArrow(F, L, span(t, 0.1, 0.6), P.danger, 4);
            glowDot(L, st.rad, t);
          }
          const j = span(t, 1.0, 0.7, k.easings.easeInOutCubic);
          const hit = 1.35;
          if (t < hit) piece("goat", O, st.rad, { angle: t > 0.6 ? Math.sin(t * 30) * 6 : 0 }); // nervous...
          else piece("goat", O, st.rad, { scale: 1 - span(t, hit, 0.3), opacity: 1 - span(t, hit, 0.3), angle: (t - hit) * 400 });
          burst(O.x, O.y, t - hit, { seed: 5, n: 18, speed: st.rad * 6, size: st.rad * 0.8, colors: ["#fffdf6", "#efe4cc", P.danger] });
          piece("tiger", j < 1 ? lerp(F, L, j) : L, st.rad, { lift: Math.sin(j * Math.PI) * 1.2, scale: 1 + 0.1 * Math.sin(j * Math.PI) });
          if (t > 1.5) stamp("CAPTURED!", st.cx, st.cap - 6, t - 1.5, { color: P.danger, size: 20, font: "ui-bold" });
        },
      },
      {
        title: "Tiger wins",
        body: `The [tiger]tiger[/tiger] wins as soon as it has captured [bad]${plural(K, "goat")}[/bad] on this board.\n\nGoats: never leave a goat with an [hi]empty point behind it[/hi] on a line the tiger can reach.`,
        loop: K * 1.6 + 3,
        demo: (r, t) => {
          const st = stage(r);
          drawBoard(B, st.o, st.S, { labels: false, detail: false });
          const F = st.at(jumper), O = st.at(over), L = st.at(land);
          const round = Math.min(K - 1, Math.floor(t / 1.6)), lt = t - round * 1.6;
          const done = t > K * 1.6;
          // The tiger jumps back and forth over a fresh goat each time.
          const [a, b] = round % 2 ? [L, F] : [F, L];
          const j = done ? 1 : span(lt, 0.45, 0.6, k.easings.easeInOutCubic);
          const hit = 0.75;
          if (!done) {
            if (lt < hit) piece("goat", O, st.rad, { scale: span(lt, 0, 0.3, k.easings.easeOutBack) });
            burst(O.x, O.y, lt - hit, { seed: round + 2, n: 14, speed: st.rad * 5, size: st.rad * 0.7, colors: ["#fffdf6", "#efe4cc", P.danger] });
          }
          const end = K % 2 ? L : F;
          piece("tiger", done ? end : lerp(a, b, j), st.rad, { lift: done ? Math.abs(Math.sin(t * 6)) * 0.6 : Math.sin(j * Math.PI) * 1.1, scale: done ? 1.25 : 1 });
          // The capture tray fills up.
          const slot = Math.min(30, (r.w * 0.8) / K - 6), y = st.cap - 2;
          const captured = done ? K : round + (lt > hit ? 1 : 0);
          for (let i = 0; i < K; i++) {
            const c = k.vec2(st.cx - ((K - 1) * (slot + 6)) / 2 + i * (slot + 6), y);
            k.drawCircle({ pos: c, radius: slot / 2, color: col("#000000"), opacity: 0.15 });
            if (i < captured) {
              k.drawSprite({ sprite: "goat", pos: c, anchor: "center", width: slot * 0.9, height: slot * 0.9, opacity: 0.6 });
              k.drawLine({ p1: c.add(-slot * 0.3, -slot * 0.3), p2: c.add(slot * 0.3, slot * 0.3), width: 3, color: col(P.danger) });
            }
          }
          if (done) {
            stamp("TIGER WINS!", st.cx, st.o.y + st.S * 0.45, t - K * 1.6, { color: P.tiger, size: 24, font: "ui-bold" });
            burst(end.x, end.y, t - K * 1.6, { seed: 9, n: 26, speed: st.S * 0.9, size: 14, gravity: st.S * 1.5, life: 1.6, colors: [P.tiger, P.marigold, "#fff1c4"] });
          }
        },
      },
      {
        title: "Goats win",
        body: `The [goat]goats[/goat] win by [hi]trapping the tiger${nT > 1 ? "s" : ""}[/hi]: surround ${nT > 1 ? "every tiger" : "it"} so it has no step and no jump left.\n\nThe rule behind it: a side that [bad]can't move on its turn loses[/bad]. That's almost always the tiger.`,
        loop: trapGoats.length * 0.4 + B.steps[trapAt].length * 0.4 + 3,
        demo: (r, t) => {
          const st = stage(r);
          drawBoard(B, st.o, st.S, { labels: false, detail: false });
          const T = st.at(trapAt);
          // The goats close in, one by one.
          trapGoats.forEach((p, i) => {
            const e = span(t, 0.2 + i * 0.4, 0.45, k.easings.easeOutBack);
            if (e > 0) piece("goat", st.at(p).add(0, -(1 - e) * st.S * 0.18), st.rad, { lift: (1 - e) * 0.8, opacity: Math.min(1, e * 3) });
          });
          // Then the tiger tries every direction... blocked.
          const tryStart = 0.4 + trapGoats.length * 0.4;
          const nbrs = B.steps[trapAt];
          const tryI = Math.floor((t - tryStart) / 0.4), tt = (t - tryStart) % 0.4;
          let nudge = k.vec2(0, 0);
          if (t > tryStart && tryI < nbrs.length) {
            const toward = st.at(nbrs[tryI]).sub(T);
            nudge = toward.scale(0.18 * Math.sin((tt / 0.4) * Math.PI));
            const mid = T.add(toward.scale(0.5));
            k.drawLine({ p1: mid.add(-8, -8), p2: mid.add(8, 8), width: 4, color: col(P.danger) });
            k.drawLine({ p1: mid.add(8, -8), p2: mid.add(-8, 8), width: 4, color: col(P.danger) });
          }
          const trapped = tryStart + nbrs.length * 0.4;
          piece("tiger", T.add(nudge), st.rad, { angle: t > trapped ? Math.sin(t * 20) * 4 : 0, scale: t > trapped ? 0.9 : 1 });
          if (t > trapped) {
            k.drawCircle({ pos: T, radius: st.rad * 1.35, fill: false, outline: { width: 4, color: col(P.danger) }, opacity: 0.8 });
            stamp("TRAPPED!", st.cx, st.cap - 6, t - trapped, { color: P.goatDeep, size: 22, font: "ui-bold" });
            burst(T.x, T.y, t - trapped, { seed: 4, n: 20, speed: st.S * 0.7, size: 13, gravity: st.S, life: 1.5, colors: [P.goat, "#fff1c4", P.marigold] });
          }
        },
      },
      {
        title: "Or a draw",
        body: `If nobody has won after [hi]${R.maxPlies} moves[/hi] in total, the game is a [hi]draw[/hi].\n\nSo the tiger has to hurry, and the goats can win by playing safe and patient.`,
        loop: 10 * 0.35 + 3,
        demo: (r, t) => {
          const st = stage(r);
          drawBoard(B, st.o, st.S, { labels: false, detail: false });
          const ticks = Math.min(10, Math.floor(t / 0.35));
          const move = R.maxPlies - 10 + ticks;
          // Both sides just pace back and forth...
          const tigerSwap = Math.floor((ticks + 1) / 2) % 2, goatSwap = Math.floor(ticks / 2) % 2;
          const tf = ticks % 2 === 0 ? span(t % 0.35, 0, 0.2) : 1;
          piece("tiger", tigerSwap ? st.at(tb) : st.at(ta), st.rad, { lift: ticks < 10 && ticks % 2 === 0 ? Math.sin(tf * Math.PI) * 0.3 : 0 });
          piece("goat", goatSwap ? st.at(gb) : st.at(ga), st.rad);
          const done = ticks >= 10;
          k.drawRect({ pos: k.vec2(st.cx - 80, st.cap - 15), width: 160, height: 30, radius: 15, color: col(done ? P.madder : "#000000"), opacity: done ? 1 : 0.15 });
          caption(`move ${move} / ${R.maxPlies}`, st.cx, st.cap, done ? "#ffffff" : "#3b2414", 16);
          if (done) {
            stamp("DRAW", st.cx, st.o.y + st.S * 0.42, t - 10 * 0.35, { color: P.indigo, size: 30, font: "ui-bold" });
            drawFit("crew-been", st.cx + 80, st.o.y + st.S * 0.42, 34, { angle: Math.sin(t * 4) * 10 });
          }
        },
      },
    ];
  };

  return new Rulebook(pages, THEME, onClose);
}
