// A pop-up rulebook: an open book whose left page plays a looping animation of
// the rule and whose right page explains it. Pages turn with a paper flip
// (← → keys, swipes, the arrows or the dots). Both games build their pages
// from this; see src/fourrow/rulebook.ts and src/scenes/baghRulebook.ts.

import { drawFit } from "./art/crew";
import { col, k } from "./engine";
import { sfx } from "./sound";
import type { Rect, UI } from "./ui";

export interface RulePage {
  title: string;
  /** Rule text. Words can be coloured with the theme's style tags, e.g. "the [tiger]tiger[/tiger]". */
  body: string;
  /** Draws the animation into `r`. `t` is seconds since the page was shown (wrapped by `loop`). */
  demo: (r: Rect, t: number) => void;
  loop?: number;
}

export interface BookTheme {
  cover: string;
  coverEdge: string;
  paper: string;
  paperShade: string;
  ink: string;
  inkDim: string;
  accent: string;
  titleFont: string;
  titleColors: [string, string]; // alternating letter colours of the page titles
  styles: Record<string, string>; // style tag -> colour
  /** A character peeking over the book. */
  mascot?: (x: number, y: number, size: number, t: number) => void;
}

const FLIP = 0.55; // seconds per page turn

export class Rulebook {
  private pages: RulePage[] = [];
  private page = 0;
  private shownAt = 0; // when the current page appeared (its animation's time 0)
  private prevShownAt = 0; // the same for the page being turned away from
  private flip: { from: number; to: number; at: number } | null = null;
  private open = 0; // 0 closed .. 1 open (animated)
  private wantOpen = false;
  private press: { x: number; y: number } | null = null;

  constructor(private buildPages: () => RulePage[], private theme: BookTheme, private onClose?: () => void) {
    k.onKeyPress("left", () => this.isOpen && this.go(this.page - 1));
    k.onKeyPress("right", () => this.isOpen && this.go(this.page + 1));
    k.onKeyPress("enter", () => this.isOpen && (this.page === this.pages.length - 1 ? this.close() : this.go(this.page + 1)));
    // Swipe left/right on a phone (or drag with the mouse) to turn pages.
    k.onMousePress(() => this.isOpen && (this.press = { x: k.mousePos().x, y: k.mousePos().y }));
    k.onMouseRelease(() => {
      if (!this.isOpen || !this.press) return;
      const dx = k.mousePos().x - this.press.x, dy = k.mousePos().y - this.press.y;
      this.press = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) this.go(this.page + (dx < 0 ? 1 : -1));
    });
  }

  /** True while the book is open (or opening): the scene should ignore other input. */
  get isOpen() {
    return this.wantOpen;
  }

  get visible() {
    return this.open > 0;
  }

  show(page = 0) {
    this.pages = this.buildPages(); // rebuilt each time: e.g. the bagh map may have changed
    this.page = Math.max(0, Math.min(page, this.pages.length - 1));
    this.shownAt = k.time();
    this.flip = null;
    this.wantOpen = true;
    sfx.page();
  }

  close() {
    if (!this.wantOpen) return;
    this.wantOpen = false;
    sfx.page();
    this.onClose?.();
  }

  private go(to: number) {
    if (to < 0 || to >= this.pages.length || to === this.page) return;
    if (this.flip) this.page = this.flip.to; // finish a flip that's still running
    this.flip = { from: this.page, to, at: k.time() };
    this.page = to;
    this.prevShownAt = this.shownAt;
    this.shownAt = k.time() + FLIP / 2; // the new page's animation starts when it's revealed
    sfx.page();
  }

  update(dt: number) {
    this.open = Math.max(0, Math.min(1, this.open + (this.wantOpen ? 1 : -1) * dt * 4));
    if (this.flip && k.time() - this.flip.at > FLIP) this.flip = null;
  }

  draw(ui: UI) {
    if (this.open <= 0) return;
    const w = k.width(), h = k.height(), T = this.theme, now = k.time();
    const o = this.open, e = k.easings.easeOutBack(o);

    k.drawRect({ pos: k.vec2(0, 0), width: w, height: h, color: col("#08060f"), opacity: 0.6 * o });
    ui.area({ x: 0, y: 0, w, h }, () => this.close()); // click outside the book to close it

    const W = Math.min(w - 20, 980), H = Math.min(h - 20, 600);
    const spread = W >= 680 && W / H > 1.3; // two pages side by side, or one tall page on phones
    const B: Rect = { x: (w - W) / 2, y: (h - H) / 2, w: W, h: H };
    ui.area(B, () => {}); // clicks on the book don't close it

    // Pop open from small and tilted.
    k.pushTransform();
    k.pushTranslate(w / 2, h / 2);
    k.pushRotate((1 - e) * -10);
    k.pushScale(0.5 + 0.5 * e, 0.5 + 0.5 * e);
    k.pushTranslate(-w / 2, -h / 2);

    T.mascot?.(B.x + B.w * 0.62, B.y + 6, Math.min(90, H * 0.17, W * 0.15), now);

    // Cover, then the paper.
    k.drawRect({ pos: k.vec2(B.x, B.y + 8), width: B.w, height: B.h, radius: 22, color: col("#000000"), opacity: 0.35 * o });
    k.drawRect({ pos: k.vec2(B.x, B.y), width: B.w, height: B.h, radius: 22, color: col(T.cover), opacity: o });
    k.drawRect({ pos: k.vec2(B.x + 6, B.y + 6), width: B.w - 12, height: B.h - 12, radius: 18, fill: false, outline: { width: 2, color: col(T.coverEdge) }, opacity: o * 0.8 });
    const m = 16, footH = 64;
    const paper: Rect = { x: B.x + m, y: B.y + m, w: B.w - 2 * m, h: B.h - 2 * m - footH + 8 };
    const pages: [Rect, Rect] = spread
      ? [{ ...paper, w: paper.w / 2 }, { ...paper, x: paper.x + paper.w / 2, w: paper.w / 2 }]
      : [{ ...paper, h: paper.h * 0.52 }, { ...paper, y: paper.y + paper.h * 0.52, h: paper.h * 0.48 }];
    for (const [i, P] of pages.entries()) {
      // Darker towards the spine, like a real open book.
      const towardSpine = spread ? (i === 0 ? [T.paper, T.paperShade] : [T.paperShade, T.paper]) : [T.paper, T.paper];
      k.drawRect({ pos: k.vec2(P.x, P.y), width: P.w, height: P.h, radius: 10, gradient: [col(towardSpine[0]), col(towardSpine[1])], horizontal: true, opacity: o });
    }
    if (spread) k.drawLine({ p1: k.vec2(paper.x + paper.w / 2, paper.y + 4), p2: k.vec2(paper.x + paper.w / 2, paper.y + paper.h - 4), width: 2, color: col(T.coverEdge), opacity: 0.35 * o });

    // The page content: during a flip, the old page until the leaf covers it, then the new one.
    const flipP = this.flip ? Math.min(1, (now - this.flip.at) / FLIP) : 1;
    const shown = this.flip && flipP < 0.5 ? this.flip.from : this.page;
    const pg = this.pages[shown];
    const t = Math.max(0, now - (this.flip && flipP < 0.5 ? this.prevShownAt : this.shownAt));
    const loopT = pg.loop ? t % pg.loop : t;
    const stage = inset(pages[0], 18);
    pg.demo(stage, loopT);
    this.drawText(pg, inset(pages[1], spread ? 26 : 18), shown, o);

    // The turning leaf: a sheet of paper folding over the spine (or across the page on phones).
    if (this.flip && flipP < 1) {
      const fwd = this.flip.to > this.flip.from;
      const p = k.easings.easeInOutSine(flipP);
      const cos = Math.abs(Math.cos(p * Math.PI));
      const shade = 1 - cos;
      if (spread) {
        const spine = paper.x + paper.w / 2, half = paper.w / 2;
        const onRight = fwd ? p < 0.5 : p >= 0.5;
        const lw = half * cos, lx = onRight ? spine : spine - lw;
        k.drawRect({ pos: k.vec2(lx, paper.y - 6 * shade), width: Math.max(1, lw), height: paper.h + 12 * shade, radius: 8, color: col(T.paper) });
        k.drawRect({ pos: k.vec2(lx, paper.y - 6 * shade), width: Math.max(1, lw), height: paper.h + 12 * shade, radius: 8, color: col(T.paperShade), opacity: shade * 0.9 });
        k.drawRect({ pos: k.vec2(onRight ? lx + lw - 3 : lx, paper.y), width: 3, height: paper.h, color: col("#000000"), opacity: 0.12 + 0.2 * shade });
      } else {
        const lw = paper.w * cos;
        const lx = (fwd ? p < 0.5 : p >= 0.5) ? paper.x : paper.x + paper.w - lw;
        k.drawRect({ pos: k.vec2(lx, paper.y), width: Math.max(1, lw), height: paper.h, radius: 10, color: col(T.paper) });
        k.drawRect({ pos: k.vec2(lx, paper.y), width: Math.max(1, lw), height: paper.h, radius: 10, color: col(T.paperShade), opacity: shade * 0.9 });
      }
    }

    this.drawFooter(ui, { x: B.x + m, y: B.y + B.h - footH - 4, w: B.w - 2 * m, h: footH }, o);
    const s = 44;
    ui.iconButton({ x: B.x + B.w - s * 0.75, y: B.y - s * 0.25, w: s, h: s }, "crew-cross_mark", () => this.close(), { tooltip: "Close (Esc)" });
    k.popTransform();
  }

  private drawText(pg: RulePage, r: Rect, index: number, o: number) {
    const T = this.theme;
    k.drawText({ text: `RULE ${index + 1} OF ${this.pages.length}`, font: "ui-bold", size: 13, pos: k.vec2(r.x, r.y), color: col(T.inkDim), opacity: o });
    const titleSize = Math.min(38, r.w / Math.max(8, pg.title.length * 0.62));
    const t = k.time();
    k.drawText({
      text: pg.title.toUpperCase(), font: T.titleFont, size: titleSize, pos: k.vec2(r.x, r.y + 22), width: r.w, opacity: o,
      transform: (i: number) => ({ color: col(T.titleColors[i % 2]), pos: k.vec2(0, Math.sin(t * 3 + i * 0.5) * titleSize * 0.05) }),
    }); // prettier-ignore
    const titleH = k.formatText({ text: pg.title.toUpperCase(), font: T.titleFont, size: titleSize, width: r.w }).height;
    // kaplay multiplies a style's colour with the text colour, so draw in white and give
    // every plain stretch of text an "ink" style: then each style shows its exact colour.
    const styles = Object.fromEntries(Object.entries({ ...T.styles, ink: T.ink }).map(([tag, c]) => [tag, { color: col(c) }]));
    const body = pg.body.split(/(\[\w+\][\s\S]*?\[\/\w+\])/).map((s) => (s && !s.startsWith("[") ? `[ink]${s}[/ink]` : s)).join("");
    const top = r.y + 22 + titleH + 14;
    // Shrink the body text until it fits.
    let size = Math.min(19, r.w * 0.05);
    while (size > 12 && k.formatText({ text: body, font: "ui", size, width: r.w, lineSpacing: 2, styles }).height > r.y + r.h - top) size -= 1;
    k.drawText({ text: body, font: "ui", size, pos: k.vec2(r.x, top), width: r.w, lineSpacing: 2, color: col("#ffffff"), styles, opacity: o });
  }

  private drawFooter(ui: UI, r: Rect, o: number) {
    const T = this.theme, n = this.pages.length, s = 48;
    const cy = r.y + r.h / 2;
    ui.iconButton({ x: r.x, y: cy - s / 2, w: s, h: s }, "crew-arrow", () => this.go(this.page - 1), { tooltip: "Previous (←)", flip: true, disabled: this.page === 0 });
    const last = this.page === n - 1;
    if (last) {
      const bw = 150;
      ui.button({ x: r.x + r.w - bw, y: cy - 24, w: bw, h: 48 }, { label: "Let's play!", style: "primary", size: 18, sprite: "crew-play-o", onClick: () => this.close() });
    } else {
      ui.iconButton({ x: r.x + r.w - s, y: cy - s / 2, w: s, h: s }, "crew-arrow", () => this.go(this.page + 1), { tooltip: "Next (→)" });
    }
    // One dot per page; click to jump there.
    const gap = 26, dx = r.x + r.w / 2 - ((n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) {
      const c = k.vec2(dx + i * gap, cy);
      const hit = { x: c.x - 11, y: c.y - 14, w: 22, h: 28 };
      const over = ui.area(hit, () => this.go(i));
      const active = i === this.page;
      k.drawCircle({ pos: c, radius: active ? 9 : over ? 7 : 6, color: col(active ? T.accent : T.paper), opacity: o, outline: { width: 2, color: col(T.coverEdge) } });
    }
  }
}

const inset = (r: Rect, m: number): Rect => ({ x: r.x + m, y: r.y + m, w: r.w - 2 * m, h: r.h - 2 * m });

// ----- helpers for the page animations ---------------------------------------------------------

/** 0 before `start`, 1 after `start + dur`, eased in between. */
export function span(t: number, start: number, dur: number, ease: (x: number) => number = (x) => x): number {
  return ease(Math.max(0, Math.min(1, (t - start) / dur)));
}

function rand(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A burst of sprites or dots flying out of (x, y), `age` seconds after it went off. Deterministic: no state. */
export function burst(x: number, y: number, age: number, o: { n?: number; seed?: number; speed?: number; size?: number; life?: number; gravity?: number; sprites?: string[]; colors?: string[] }) {
  const life = o.life ?? 0.9;
  if (age < 0 || age > life) return;
  const r = rand(o.seed ?? 1), n = o.n ?? 14, speed = o.speed ?? 120, size = o.size ?? 18, g = o.gravity ?? 0;
  const fade = 1 - age / life;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, v = speed * (0.4 + r());
    const px = x + Math.cos(a) * v * age, py = y + Math.sin(a) * v * age + 0.5 * g * age * age;
    const sz = size * (0.6 + r() * 0.6);
    if (o.sprites) drawFit(o.sprites[i % o.sprites.length], px, py, sz * (0.6 + 0.4 * fade), { angle: (r() - 0.5) * 720 * age, opacity: Math.min(1, fade * 2) });
    else k.drawCircle({ pos: k.vec2(px, py), radius: sz * 0.25 * (0.5 + 0.5 * fade), color: col((o.colors ?? ["#ffffff"])[i % (o.colors ?? ["#ffffff"]).length]), opacity: fade });
  }
}

/** A rubber stamp that slams down: big, tilted label that scales in from 2x. */
export function stamp(text: string, x: number, y: number, age: number, o: { color: string; ink?: string; size?: number; font?: string; angle?: number }) {
  if (age < 0) return;
  const p = Math.min(1, age / 0.35);
  const s = 2.2 - 1.2 * k.easings.easeOutBack(p);
  const size = o.size ?? 30, font = o.font ?? "happy-o";
  const tw = k.formatText({ text, size, font }).width + size * 1.1, th = size * 1.6;
  k.pushTransform();
  k.pushTranslate(x, y);
  k.pushRotate(o.angle ?? -8);
  k.pushScale(s, s);
  k.drawRect({ pos: k.vec2(0, 4), width: tw, height: th, radius: th * 0.3, anchor: "center", color: col("#000000"), opacity: 0.25 * p });
  k.drawRect({ width: tw, height: th, radius: th * 0.3, anchor: "center", color: col(o.color), opacity: p });
  k.drawRect({ width: tw - 8, height: th - 8, radius: th * 0.25, anchor: "center", fill: false, outline: { width: 3, color: col("#ffffff") }, opacity: 0.7 * p });
  k.drawText({ text, size, font, anchor: "center", color: col(o.ink ?? "#ffffff"), opacity: p });
  k.popTransform();
}

/** A caption under (or over) an animation. */
export function caption(text: string, x: number, y: number, color: string, size = 17) {
  k.drawText({ text, size, font: "ui-bold", pos: k.vec2(x, y), anchor: "center", color: col(color) });
}

/** A dashed arrow from a to b, drawn up to `progress` (0..1). */
export function dashedArrow(a: { x: number; y: number }, b: { x: number; y: number }, progress: number, color: string, width = 4) {
  const A = k.vec2(a.x, a.y), Bv = k.vec2(b.x, b.y);
  const len = A.dist(Bv) * progress;
  if (len < 2) return;
  const dir = Bv.sub(A).unit();
  for (let d = 0; d < len - 10; d += 14) k.drawLine({ p1: A.add(dir.scale(d)), p2: A.add(dir.scale(Math.min(d + 8, len - 10))), width, color: col(color) });
  const tip = A.add(dir.scale(len)), n = k.vec2(-dir.y, dir.x);
  k.drawTriangle({ p1: tip, p2: tip.sub(dir.scale(14)).add(n.scale(8)), p3: tip.sub(dir.scale(14)).sub(n.scale(8)), color: col(color) });
}
