import kaplay, { type Color } from "kaplay";

/** The one kaplay instance. No fixed size: the canvas fills the window and every scene lays itself out. */
export const k = kaplay({
  global: false,
  background: [20, 18, 43],
  pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  texFilter: "linear",
  crisp: false,
  touchToMouse: true,
  maxFPS: 60,
  burp: false,
});

const colors = new Map<string, Color>();
/** Hex string -> kaplay Color (cached). */
export function col(hex: string): Color {
  let c = colors.get(hex);
  if (!c) colors.set(hex, (c = k.rgb(hex)));
  return c;
}
