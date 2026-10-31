// Where the site lives and which page we're on. The site has three pages that run
// the same game: / (pick a game), /bagh-chagol/ and /four-in-a-row/, so search
// engines and link previews see each game on its own address.

/** The page this HTML file was made for, from <meta name="app-start">. */
export type Page = "home" | "bagh" | "fourrow";

const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;

/**
 * The site root as an absolute URL, worked out once at startup from
 * <meta name="app-root"> ("./" on the home page, "../" on the game pages).
 * Computed before we ever change the address bar, so it never drifts.
 */
export const ROOT = new URL(meta("app-root") ?? "./", document.baseURI).href;

export const startPage: Page = (meta("app-start") as Page | undefined) ?? "home";

export const PAGE_PATH: Record<Page, string> = { home: "", bagh: "bagh-chagol/", fourrow: "four-in-a-row/" };

/** The full address of a page, e.g. https://example.com/four-in-a-row/ */
export const pageUrl = (page: Page) => ROOT + PAGE_PATH[page];

/** Old links used #bagh / #fourrow; they still work. */
export function pageFromHash(): Page | null {
  return ({ "#bagh": "bagh", "#fourrow": "fourrow" } as const)[location.hash] ?? null;
}

/** Tab titles, matching the <title> of each page's HTML file. */
const TITLES: Record<Page, string> = {
  home: "বাঘ-ছাগল (Bagh-Chagol) & Four in a Row · Board Games vs AI",
  bagh: "বাঘ-ছাগল (Bagh-Chagol) · Play the Tiger and Goats Board Game Online",
  fourrow: "Four in a Row · Play Free Online Against an AI",
};

/** Keep the address bar and tab title on the game being shown, so reloading, bookmarking or copying the link opens it again. */
export function showPage(page: Page) {
  const url = pageUrl(page);
  if (location.href !== url) history.replaceState(null, "", url);
  document.title = TITLES[page];
}
