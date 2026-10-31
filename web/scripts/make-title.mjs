// Renders the Bengali title "বাঘ-ছাগল" to public/title.png.
//
// kaplay rasterises text one character at a time, which breaks Bengali vowel
// signs and conjuncts, so the title is shipped as an image instead. This uses
// the browser's text engine (via a locally installed Chrome or Edge) once.
//
//     bun scripts/make-title.mjs

import { readFileSync, existsSync } from "node:fs";
import { chromium } from "playwright-core";

const font = (f) => readFileSync(new URL(`../node_modules/@fontsource/galada/files/${f}`, import.meta.url)).toString("base64");
const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];
const browser = await chromium.launch({ executablePath: browsers.find(existsSync) });
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><style>
  @font-face { font-family: G; src: url(data:font/woff2;base64,${font("galada-bengali-400-normal.woff2")}); unicode-range: U+0980-09FE, U+200C-200D, U+25CC; }
  @font-face { font-family: G; src: url(data:font/woff2;base64,${font("galada-latin-400-normal.woff2")}); }
  html, body { margin: 0; background: transparent; }
  #t { display: inline-block; padding: 30px 60px 10px; font: 230px/1.25 G; position: relative; }
  #t span { position: absolute; inset: 30px 60px 10px; }
  .glow { color: transparent; text-shadow: 0 0 40px rgba(242, 177, 60, 0.6); }
  .edge { -webkit-text-stroke: 26px #3a1408; color: #3a1408; transform: translateY(8px); }
  .fill { background: linear-gradient(#fff3c0 15%, #f2b13c 55%, #c9701d 90%); -webkit-background-clip: text; color: transparent; }
</style></head><body><div id="t"><span class="glow">বাঘ-ছাগল</span><span class="edge">বাঘ-ছাগল</span><span class="edge" style="transform:none">বাঘ-ছাগল</span><span class="fill">বাঘ-ছাগল</span><i style="visibility:hidden;font-style:normal">বাঘ-ছাগল</i></div></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.locator("#t").screenshot({ path: new URL("../public/title.png", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), omitBackground: true });
await browser.close();
console.log("wrote public/title.png");
