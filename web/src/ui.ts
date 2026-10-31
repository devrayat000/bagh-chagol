// A small immediate-mode UI layer on top of kaplay's draw functions.
// Each frame the scene draws its widgets; buttons record where they are, and
// a click is matched against the rectangles drawn in the latest frame.

import { assets as crew } from "@kaplayjs/crew";
import type { Anchor, SpriteData } from "kaplay";
import { col, k } from "./engine";
import { drawFit } from "./art/crew";
import { PALETTE as P } from "./art/palette";
import { sfx } from "./sound";

/** Mouse or trackpad (not touch): only then do we draw our own cursor and tooltips. */
const finePointer = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/**
 * The KAPLAY crew hands as real CSS cursors. The browser draws these itself, so
 * they follow the mouse instantly; a cursor drawn into the canvas can only move
 * once per rendered frame and always trails the real mouse a little.
 * The numbers are each image's hotspot: the pixel that does the clicking.
 */
const CREW_CURSORS = {
  arrow: `url("${crew.cursor.outlined}") 4 7, default`,
  pointer: `url("${crew.pointer.outlined}") 8 3, pointer`,
  grab: `url("${crew.knock.outlined}") 13 14, grabbing`,
};
let currentCursor = "";

function setCursor(css: string) {
  if (css !== currentCursor) k.setCursor((currentCursor = css)); // only touch the DOM when it changes
}

let toastMsg: { text: string; sprite?: string; at: number } | null = null;

/** A short message that pops up at the bottom of the screen, e.g. "Link copied!". */
export function toast(text: string, sprite?: string) {
  toastMsg = { text, sprite, at: k.time() };
}

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

export interface IconButtonOpts {
  tooltip?: string;
  active?: boolean;
  disabled?: boolean;
  crossed?: boolean; // draw a red slash over the icon (e.g. sound off)
  flip?: boolean; // mirror the icon (the crew arrow points right; flipped it means "back")
}

export class UI {
  private hits: Hit[] = [];
  private pressed: Rect | null = null;
  private pressedAt = 0;
  private tooltip: { text: string; r: Rect } | null = null;
  hovering = false;

  /** crewCursor: use the KAPLAY crew hands as the mouse cursor. */
  constructor(private opts: { crewCursor?: boolean } = {}) {}

  beginFrame() {
    this.hits = [];
    this.hovering = false;
    this.tooltip = null;
  }

  endFrame() {
    if (this.tooltip && finePointer) drawTooltip(this.tooltip.text, this.tooltip.r);
    drawToast();
    if (!this.opts.crewCursor) return setCursor(this.hovering ? "pointer" : "default");
    setCursor(k.isMouseDown("left") ? CREW_CURSORS.grab : this.hovering ? CREW_CURSORS.pointer : CREW_CURSORS.arrow);
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

  /** A round button showing a crew icon, with a tooltip on hover. */
  iconButton(r: Rect, sprite: string, onClick: () => void, o: IconButtonOpts = {}) {
    const over = !o.disabled && this.area(r, onClick);
    if (over && o.tooltip) this.tooltip = { text: o.tooltip, r };
    const justPressed = this.pressed && this.pressed.x === r.x && this.pressed.y === r.y && k.time() - this.pressedAt < 0.12;
    const s = justPressed ? 0.9 : over ? 1.08 : 1;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = Math.min(r.w, r.h) / 2;
    k.drawCircle({ pos: k.vec2(cx, cy + 3), radius: rad * s, color: col("#000000"), opacity: 0.25 });
    k.drawCircle({ pos: k.vec2(cx, cy), radius: rad * s, color: col(o.active ? "#ffe08a" : over ? "#ffffff" : "#f3eefe") });
    k.drawCircle({ pos: k.vec2(cx, cy), radius: rad * s, fill: false, outline: { width: 3, color: col("#2d2750") } });
    const wobble = over ? Math.sin(k.time() * 10) * 6 : 0;
    drawFit(sprite, cx, cy, rad * 1.3 * s, { opacity: o.disabled ? 0.35 : 1, angle: wobble, flipX: o.flip });
    if (o.crossed) k.drawLine({ p1: k.vec2(cx - rad * 0.55, cy + rad * 0.55), p2: k.vec2(cx + rad * 0.55, cy - rad * 0.55), width: 4, color: col("#e5544b") });
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

function drawTooltip(str: string, r: Rect) {
  const size = 15;
  const w = k.formatText({ text: str, size, font: "ui-bold" }).width + 20;
  const x = Math.max(6, Math.min(k.width() - w - 6, r.x + r.w / 2 - w / 2));
  const below = r.y + r.h + 8 + 30 < k.height();
  const y = below ? r.y + r.h + 8 : r.y - 38;
  k.drawRect({ pos: k.vec2(x, y), width: w, height: 30, radius: 10, color: col("#1b1638"), opacity: 0.95 });
  text(str, x + w / 2, y + 15, { size, font: "ui-bold", anchor: "center" });
}

function drawToast() {
  if (!toastMsg) return;
  const age = k.time() - toastMsg.at;
  if (age > 2.4) return void (toastMsg = null);
  const appear = Math.min(1, age * 6), fade = Math.min(1, (2.4 - age) * 4);
  const size = 18, icon = toastMsg.sprite ? 30 : 0;
  const w = k.formatText({ text: toastMsg.text, size, font: "ui-bold" }).width + 36 + icon;
  const x = (k.width() - w) / 2, y = k.height() - 70 - 20 * (1 - k.easings.easeOutBack(appear));
  k.drawRect({ pos: k.vec2(x, y + 4), width: w, height: 48, radius: 24, color: col("#000000"), opacity: 0.25 * fade });
  k.drawRect({ pos: k.vec2(x, y), width: w, height: 48, radius: 24, color: col("#ffffff"), opacity: fade });
  if (toastMsg.sprite) drawFit(toastMsg.sprite, x + 18 + icon / 2, y + 24, icon, { opacity: fade });
  text(toastMsg.text, x + 18 + icon + (icon ? 6 : 0), y + 24, { size, font: "ui-bold", anchor: "left", color: "#2d2750", opacity: fade });
}

/** A translucent card that UI sits on. */
export function card(r: Rect, opts: { opacity?: number; radius?: number; color?: string; edge?: string } = {}) {
  const radius = opts.radius ?? 18;
  k.drawRect({ pos: k.vec2(r.x, r.y + 4), width: r.w, height: r.h, radius, color: col("#000000"), opacity: 0.22 });
  k.drawRect({ pos: k.vec2(r.x, r.y), width: r.w, height: r.h, radius, color: col(opts.color ?? P.panel), opacity: opts.opacity ?? 0.86 });
  k.drawRect({ pos: k.vec2(r.x, r.y), width: r.w, height: r.h, radius, fill: false, outline: { width: 1.5, color: col(opts.edge ?? P.panelEdge) } });
}
