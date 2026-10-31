import { DIFFICULTIES, type AiClient } from "../ai/client";
import { AI_AVATARS, AVATAR_NAMES, AVATAR_VOICE, AVATARS, drawFit, type Avatar } from "../art/crew";
import { col, k } from "../engine";
import { saveFourRowSettings, type FourRowEntry, type FourRowSettings } from "../maps";
import { crewSound, sfx } from "../sound";
import { card, text, UI, type Rect } from "../ui";
import { drawDay, drawDisc, FR } from "./art";
import type { FourRowPlayArgs } from "./play";
import { drawHelp, drawTitle, drawTopBar } from "./widgets";

export function fourRowMenuScene(entry: FourRowEntry, settings: FourRowSettings, ai: AiClient) {
  const ui = new UI({ crewCursor: true });
  const jump = new Map<Avatar, number>(); // time each avatar was last clicked, for a little hop
  let starting = false;
  let help = 0, helpOpen = false;

  async function start() {
    if (starting) return;
    starting = true;
    saveFourRowSettings(settings);
    await ai.load({ game: "fourrow", def: entry.def }, entry.modelUrl);
    const difficulty = DIFFICULTIES.find((d) => d.id === settings.difficulty)!;
    k.go("fourrow-play", { entry, avatar: settings.avatar, human: settings.side, difficulty, ai } satisfies FourRowPlayArgs);
  }

  function pick(a: Avatar) {
    settings.avatar = a;
    jump.set(a, k.time());
    const voice = AVATAR_VOICE[a];
    if (voice) crewSound(voice);
    else sfx.select();
  }

  k.onMousePress((btn) => {
    if (btn === "left") ui.click(k.mousePos().x, k.mousePos().y);
  });
  k.onKeyPress("enter", () => void start());
  k.onKeyPress("escape", () => (helpOpen ? (helpOpen = false) : k.go("home")));
  k.onUpdate(() => (help = Math.max(0, Math.min(1, help + (helpOpen ? 1 : -1) * k.dt() * 5))));

  k.onDraw(() => {
    ui.beginFrame();
    const w = k.width(), h = k.height(), t = k.time();
    drawDay(w, h);
    const top = drawTopBar(ui, {
      back: { tooltip: "All games", onClick: () => k.go("home") },
      onHelp: () => (helpOpen = true),
      shareText: "Can you beat the crew at Four in a Row?",
    });

    const cw = Math.min(w - 28, 760);
    const x0 = (w - cw) / 2;
    const titleSize = Math.min(78, cw * 0.085);
    // Everything below the title, so the menu can be centred vertically.
    const tileCols = cw < 520 ? 4 : 8;
    const tile = Math.min(84, (cw - 40 - (tileCols - 1) * 10) / tileCols);
    const pickH = 52 + Math.ceil(AVATARS.length / tileCols) * (tile + 10);
    const optsH = cw < 520 ? 196 : 112;
    const totalH = titleSize * 1.2 + 40 + pickH + 16 + optsH + 16 + 70;
    let y = Math.max(top + 4, (h - totalH) / 2);

    drawTitle(w / 2, y + titleSize * 0.6, titleSize);
    y += titleSize * 1.2;
    text("Drop your discs, line up four, beat the crew!", w / 2, y, { size: Math.min(20, cw * 0.035), color: FR.ink, anchor: "top", font: "ui-bold" });
    y += 40;

    // Pick your crew member.
    const pickR = { x: x0, y, w: cw, h: pickH };
    card(pickR, { color: "#fffaf0", edge: FR.boardEdge, opacity: 0.95, radius: 22 });
    text("Pick your crew", x0 + 20, y + 14, { size: 18, font: "ui-bold", color: FR.ink });
    text(`Your discs show ${AVATAR_NAMES[settings.avatar]}`, x0 + cw - 20, y + 16, { size: 15, color: "#6b6390", anchor: "topright" });
    const gridW = tileCols * tile + (tileCols - 1) * 10;
    AVATARS.forEach((a, i) => {
      const r = { x: x0 + (cw - gridW) / 2 + (i % tileCols) * (tile + 10), y: y + 48 + Math.floor(i / tileCols) * (tile + 10), w: tile, h: tile };
      drawAvatarTile(a, r, t);
    });
    y += pickH + 16;

    // Who goes first, and how strong the AI is.
    const optsR = { x: x0, y, w: cw, h: optsH };
    card(optsR, { color: "#fffaf0", edge: FR.boardEdge, opacity: 0.95, radius: 22 });
    const narrow = cw < 520;
    const colW = narrow ? cw - 40 : (cw - 60) / 2;
    const sideX = x0 + 20, diffX = narrow ? x0 + 20 : x0 + 40 + colW;
    const diffY = narrow ? y + 96 : y + 14;
    text("You go", sideX, y + 14, { size: 16, font: "ui-bold", color: FR.ink });
    ([0, 1] as const).forEach((s) => {
      const r = { x: sideX + s * (colW / 2 + 4), y: y + 42, w: colW / 2 - 4, h: 50 };
      ui.button(r, { label: s === 0 ? "First" : "Second", active: settings.side === s, accent: s === 0 ? FR.red : FR.yellow, size: 18, onClick: () => (settings.side = s) });
      drawDisc(r.x + 26, r.y + 25, 14, s, settings.side === s ? settings.avatar : null);
    });
    const aiAvatar = AI_AVATARS[settings.difficulty];
    text(`Opponent: ${AVATAR_NAMES[aiAvatar]}`, diffX, diffY, { size: 16, font: "ui-bold", color: FR.ink });
    drawFit(`crew-${aiAvatar}`, diffX + colW - 18, diffY + 10, 30, { angle: Math.sin(t * 3) * 8 });
    const bw = (colW - 16) / 3;
    DIFFICULTIES.forEach((d, i) =>
      ui.button({ x: diffX + i * (bw + 8), y: diffY + 28, w: bw, h: 50 }, { label: d.label, active: settings.difficulty === d.id, size: 18, accent: "#8f7dff", onClick: () => (settings.difficulty = d.id) }),
    );
    y += optsH + 16;

    // Play!
    const pw = Math.min(320, cw);
    const playR: Rect = { x: (w - pw) / 2, y, w: pw, h: 64 };
    const pulse = 1 + Math.sin(t * 4) * 0.02;
    k.pushTransform();
    k.pushTranslate(w / 2, y + 32);
    k.pushScale(pulse, pulse);
    k.pushTranslate(-w / 2, -(y + 32));
    ui.button(playR, { label: starting ? "Loading..." : "Play", style: "primary", size: 28, sprite: "crew-play-o", onClick: () => void start() });
    k.popTransform();
    const status = entry.def.trained ? `Trained AI · self-play iteration ${entry.def.iteration}` : "The AI's network is still training: it plays by search only";
    text(status, w / 2, y + 76, { size: 14, color: FR.ink, anchor: "top", opacity: 0.75 });

    if (help > 0) drawHelp(ui, help, () => (helpOpen = false));
    ui.endFrame();
  });

  function drawAvatarTile(a: Avatar, r: Rect, t: number) {
    const selected = settings.avatar === a;
    const over = ui.area(r, () => pick(a));
    const since = t - (jump.get(a) ?? -10);
    const hop = since < 0.45 ? Math.sin((since / 0.45) * Math.PI) * r.h * 0.22 : 0;
    const bob = over || selected ? Math.sin(t * 6) * r.h * 0.03 : 0;
    k.drawRect({ pos: k.vec2(r.x, r.y + 3), width: r.w, height: r.h, radius: 16, color: col("#000000"), opacity: 0.12 });
    k.drawRect({ pos: k.vec2(r.x, r.y), width: r.w, height: r.h, radius: 16, color: col(selected ? FR.gold : over ? "#ffffff" : "#efe9ff") });
    if (selected) k.drawRect({ pos: k.vec2(r.x, r.y), width: r.w, height: r.h, radius: 16, fill: false, outline: { width: 4, color: col(FR.boardEdge) } });
    drawFit(`crew-${a}`, r.x + r.w / 2, r.y + r.h / 2 - hop - bob, r.w * 0.66, { angle: over ? Math.sin(t * 9) * 6 : 0 });
  }
}
