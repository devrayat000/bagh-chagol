// Sharing a link to the game: the system share sheet where there is one
// (phones), otherwise copy the link to the clipboard and say so.

import { toast } from "./ui";

/** The game's address, opening on `hash` (e.g. "fourrow"). */
export function gameUrl(hash = ""): string {
  return location.origin + location.pathname + (hash ? `#${hash}` : "");
}

export async function share(title: string, text: string, hash = "") {
  const url = gameUrl(hash);
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // the player closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast("Link copied!", "crew-check_mark");
  } catch {
    toast("Could not copy the link", "crew-cross_mark");
  }
}
