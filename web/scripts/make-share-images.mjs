// Makes the icons and the social-media preview image in public/.
//
//     bun run preview --port 4173     (in another terminal, after `bun run build`)
//     bun scripts/make-share-images.mjs [http://localhost:4173/]
//
// Icons reuse the tiger token from the game. The share images (1200x630, the size
// Facebook/X/WhatsApp/LinkedIn expect) are screenshots of each page's real screen:
// og-image.png (pick a game), og-bagh-chagol.png and og-four-in-a-row.png (the menus).

import { existsSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { PIECE_SVGS } from "../src/art/pieces.ts";

const url = process.argv[2] ?? "http://localhost:4173/";
const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

writeFileSync(out("favicon.svg"), PIECE_SVGS.tiger.trim());

const browser = await chromium.launch({ executablePath: browsers.find(existsSync), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

// App icons: the token on the night-blue background. `inset` keeps maskable icons inside the safe zone.
for (const [file, size, inset] of [["apple-touch-icon.png", 180, 0.1], ["icon-192.png", 192, 0.04], ["icon-512.png", 512, 0.04], ["icon-maskable-512.png", 512, 0.2]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const pad = Math.round(size * inset);
  await page.setContent(`<body style="margin:0;background:radial-gradient(circle at 50% 40%,#2c2350,#14122b);width:${size}px;height:${size}px;display:grid;place-items:center">
    <img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(PIECE_SVGS.tiger)}" style="width:${size - 2 * pad}px;height:${size - 2 * pad}px"></body>`);
  await page.screenshot({ path: out(file) });
  await page.close();
}

// Share images: each page's own first screen at 1200x630.
for (const [path, file] of [["", "og-image.png"], ["bagh-chagol/", "og-bagh-chagol.png"], ["four-in-a-row/", "og-four-in-a-row.png"]]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.addInitScript(() => {
    localStorage.setItem("bagh.settings", JSON.stringify({ mapId: "hourglass", side: 1, difficulty: "medium" }));
    localStorage.setItem("fourrow.settings", JSON.stringify({ avatar: "bean", side: 0, difficulty: "medium" }));
  });
  await page.goto(new URL(path, url).href);
  await page.mouse.move(1199, 629); // keep the cursor out of the way
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out(file) });
  await page.close();
}
await browser.close();
console.log("wrote favicon.svg, the app icons, og-image.png, og-bagh-chagol.png and og-four-in-a-row.png");
