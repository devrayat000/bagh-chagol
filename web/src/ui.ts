// A small immediate-mode UI layer on top of kaplay's draw functions.
// Each frame the scene draws its widgets; buttons record where they are, and
// a click is matched against the rectangles drawn in the latest frame.

import type { Anchor, SpriteData } from "kaplay";
import { col, k } from "./engine";
import { PALETTE as P } from "./art/palette";
import { sfx } from "./sound";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

interface Hit extends Rect {
  onClick: () => void;
}

export type ButtonStyle = "primary" | "secondary" | "ghost";

export interface ButtonOpts {
  label: string;
  onClick: () => void;
  style?: ButtonStyle;
  active?: boolean; // for toggle groups
  disabled?: boolean;
  size?: number; // font size
  sprite?: SpriteData | string; // optional icon left of the label
  accent?: string;
}

export class UI {
  private hits: Hit[] = [];
  private pressed: Rect | null = null;
  private pressedAt = 0;
  hovering = false;

  beginFrame() {
    this.hits = [];
    this.hovering = false;
  }

  endFrame() {
    k.setCursor(this.hovering ? "pointer" : "default");
  }

  /** Returns true if the click hit a widget. */
  click(x: number, y: number): boolean {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (inside(h, x, y)) {
        this.pressed = h;
        this.pressedAt = k.time();
        sfx.click();
        h.onClick();
        return true;
      }
    }
    return false;
  }

  /** Register an invisible clickable area (e.g. a map card). Returns whether the mouse is over it. */
  area(r: Rect, onClick: () => void): boolean {
    this.hits.push({ ...r, onClick });
    const m = k.mousePos();
    const over = inside(r, m.x, m.y);
    if (over) this.hovering = true;
    return over;
  }

  button(r: Rect, o: ButtonOpts) {
    const style = o.style ?? "secondary";
    const over = !o.disabled && this.area(r, o.disabled ? () => {} : o.onClick);
    const justPressed = this.pressed && this.pressed.x === r.x && this.pressed.y === r.y && k.time() - this.pressedAt < 0.12;
    const s = justPressed ? 0.95 : over ? 1.03 : 1;
    const accent = o.accent ?? P.gold;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const radius = Math.min(r.h / 2, 14);

    k.pushTransform();
    k.pushTranslate(cx, cy);
    k.pushScale(s, s);
    // drop shadow
    k.drawRect({ pos: k.vec2(0, 3), width: r.w, height: r.h, radius, anchor: "center", color: col("#000000"), opacity: 0.25 });
    if (style === "primary") {
      k.drawRect({ width: r.w, height: r.h, radius, anchor: "center", color: col(over ? "#f8c04f" : "#f0a92e") });
      k.drawRect({ pos: k.vec2(0, -r.h * 0.22), width: r.w - radius, height: r.h * 0.36, radius: r.h * 0.18, anchor: "center", color: col("#fff1c4"), opacity: 0.25 });
      k.drawRect({ width: r.w, height: r.h, radius, anchor: "center", fill: false, outline: { width: 2, color: col("#ffe2a0") } });
    } else if (style === "secondary" || o.active) {
      const fill = o.active ? accent : over ? "#3d3566" : "#2d2750";
      k.drawRect({ width: r.w, height: r.h, radius, anchor: "center", color: col(fill), opacity: o.active ? 0.95 : 1 });
      k.drawRect({ width: r.w, height: r.h, radius, anchor: "center", fill: false, outline: { width: 1.5, color: col(o.active ? "#fff1c4" : P.panelEdge) } });
    } else {
      k.drawRect({ width: r.w, height: r.h, radius, anchor: "center", color: col("#ffffff"), opacity: over ? 0.1 : 0.04 });
      k.drawRect({ width: r.w, height: r.h, radius, anchor: "center", fill: false, outline: { width: 1.5, color: col("#ffffff") }, opacity: 0.18 });
    }
    const size = o.size ?? Math.min(22, r.h * 0.45);
    const dark = style === "primary" || o.active;
    const textColor = o.disabled ? "#77708f" : dark ? "#2a1606" : P.ink;
    let tx = 0;
    if (o.sprite) {
      const icon = size * 1.5;
      const tw = k.formatText({ text: o.label, size, font: "ui-bold" }).width;
      const total = icon + size * 0.4 + tw;
      k.drawSprite({ sprite: o.sprite as SpriteData, width: icon, height: icon, anchor: "center", pos: k.vec2(-total / 2 + icon / 2, 0), opacity: o.disabled ? 0.4 : 1 });
      tx = -total / 2 + icon + size * 0.4 + tw / 2;
    }
    k.drawText({ text: o.label, size, font: "ui-bold", anchor: "center", pos: k.vec2(tx, size * 0.06), color: col(textColor) });
    k.popTransform();
  }
}

export interface TextOpts {
  size: number;
  color?: string;
  font?: "ui" | "ui-bold";
  anchor?: Anchor;
  width?: number;
  align?: "left" | "center" | "right";
  opacity?: number;
  lineSpacing?: number;
}

export function text(str: string, x: number, y: number, o: TextOpts) {
  k.drawText({
    text: str,
    pos: k.vec2(x, y),
    size: o.size,
    font: o.font ?? "ui",
    color: col(o.color ?? P.ink),
    anchor: o.anchor ?? "topleft",
    width: o.width,
    align: o.align,
    opacity: o.opacity ?? 1,
    lineSpacing: o.lineSpacing,
  });
}

export function textHeight(str: string, o: TextOpts): number {
  return k.formatText({ text: str, size: o.size, font: o.font ?? "ui", width: o.width, lineSpacing: o.lineSpacing }).height;
}

/** A translucent card that UI sits on. */
export function card(r: Rect, opts: { opacity?: number; radius?: number; color?: string; edge?: string } = {}) {
  const radius = opts.radius ?? 18;
  k.drawRect({ pos: k.vec2(r.x, r.y + 4), width: r.w, height: r.h, radius, color: col("#000000"), opacity: 0.22 });
  k.drawRect({ pos: k.vec2(r.x, r.y), width: r.w, height: r.h, radius, color: col(opts.color ?? P.panel), opacity: opts.opacity ?? 0.86 });
  k.drawRect({ pos: k.vec2(r.x, r.y), width: r.w, height: r.h, radius, fill: false, outline: { width: 1.5, color: col(opts.edge ?? P.panelEdge) } });
}
