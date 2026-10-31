import { crew } from "@kaplayjs/crew";
import kaplay, { type Color } from "kaplay";

/** The one kaplay instance. No fixed size: the canvas fills the window and every scene lays itself out. */
export const k = kaplay({
  global: false,
  background: [20, 18, 43],
  pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  texFilter: "linear",
  crisp: false,
  touchToMouse: true,
  // No maxFPS: kaplay renders only when MORE than 1/maxFPS has passed, so on a 60 Hz
  // screen any slightly early frame was skipped (~40 fps with 33 ms hitches).
  burp: false,
  plugins: [crew],
});

const colors = new Map<string, Color>();
/** Hex string -> kaplay Color (cached). */
export function col(hex: string): Color {
  let c = colors.get(hex);
  if (!c) colors.set(hex, (c = k.rgb(hex)));
  return c;
}
