// UI font: Baloo Da 2 (rounded and friendly), loaded into kaplay at a large
// atlas size so it stays crisp when scaled. The Bengali title is an image
// (public/title.png): kaplay draws text one character at a time, which cannot
// join Bengali letters and vowel signs.

import baloo600 from "@fontsource/baloo-da-2/files/baloo-da-2-latin-600-normal.woff2?url";
import baloo800 from "@fontsource/baloo-da-2/files/baloo-da-2-latin-800-normal.woff2?url";
import type { KAPLAYCtx } from "kaplay";

export function loadFonts(k: KAPLAYCtx) {
  k.loadFont("ui", baloo600, { size: 72, filter: "linear" });
  k.loadFont("ui-bold", baloo800, { size: 72, filter: "linear" });
}
