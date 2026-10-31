// Stock art and sounds from the KAPLAY crew (https://kaplayjs.com/crew), loaded
// through the @kaplayjs/crew plugin. Every name gets a "crew-" prefix so it
// can't clash with the game's own sprites.

import type { SpriteData } from "kaplay";
import { k } from "../engine";

/** Crew members you can pick as your four-in-a-row avatar. */
export const AVATARS = ["bean", "mark", "kat", "ghosty", "bobo", "marroc", "onion", "zombean"] as const;
export type Avatar = (typeof AVATARS)[number] | AiAvatar;

/** The AI's crew member, by difficulty. */
export const AI_AVATARS = { easy: "bobo", medium: "ghosty", hard: "gigagantrum" } as const;
type AiAvatar = (typeof AI_AVATARS)[keyof typeof AI_AVATARS];

export const AVATAR_NAMES: Record<Avatar, string> = {
  bean: "Bean", mark: "Mark", kat: "Kat", ghosty: "Ghosty", bobo: "Bobo",
  marroc: "Marroc", onion: "Onion", zombean: "Zombean", gigagantrum: "Gigagantrum",
}; // prettier-ignore

/** The crew sound that belongs to a character, if it has one. */
export const AVATAR_VOICE: Partial<Record<Avatar, string>> = { bean: "crew-bean_voice", mark: "crew-mark_voice" };

const UI_ICONS = ["play", "share", "cross_mark", "check_mark", "arrow", "home",
                  "question_mark", "sounds", "history", "trash", "like", "menu", "marks_legend"] as const; // prettier-ignore
const DECOR = ["sparkles", "star", "heart", "cloud", "sun", "grass", "flowy", "btfly", "coin", "sparkle"] as const;
const EMOJIS = ["beenking", "pog", "been", "beant", "firing", "sparkling", "wizarding"] as const;

export function loadCrewAssets() {
  for (const name of [...UI_ICONS, ...DECOR, ...EMOJIS, ...AVATARS, ...Object.values(AI_AVATARS)]) {
    k.loadCrew("sprite", name, `crew-${name}`);
    k.loadCrew("sprite", `${name}-o`, `crew-${name}-o`); // outlined version: reads well on any background
  }
  k.loadCrew("font", "happy", "happy");
  k.loadCrew("font", "happy-o", "happy-o");
  for (const s of ["bean_voice", "mark_voice", "burp"] as const) k.loadCrew("sound", s, `crew-${s}`);
}

/** Draw a sprite scaled to fit a size x size box, keeping its aspect ratio. */
export function drawFit(sprite: string, x: number, y: number, size: number,
                        opts: { opacity?: number; angle?: number; flipX?: boolean; anchor?: "center" | "bot"; frame?: number } = {}) { // prettier-ignore
  const data = k.getSprite(sprite)?.data as SpriteData | undefined;
  if (!data) return;
  const s = size / Math.max(data.width, data.height);
  k.drawSprite({
    sprite, pos: k.vec2(x, y), anchor: opts.anchor ?? "center",
    width: data.width * s, height: data.height * s,
    opacity: opts.opacity ?? 1, angle: opts.angle ?? 0, flipX: opts.flipX,
    frame: opts.frame === undefined ? 0 : opts.frame % data.frames.length,
  }); // prettier-ignore
}
