// Sharing a link to the game: the system share sheet where there is one
// (phones), otherwise copy the link to the clipboard and say so.

import { pageUrl, type Page } from "./site";
import { toast } from "./ui";

export async function share(title: string, text: string, page: Page = "home") {
  const url = pageUrl(page);
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
