import { k } from "../engine";
import { loadCrewAssets } from "./crew";
import { loadFonts } from "./fonts";

/** Queue every asset with kaplay's loader; scenes start from k.onLoad once all are ready. */
export function loadAssets() {
  k.loadSprite("tiger", "/sprites/tiger.svg");
  k.loadSprite("goat", "/sprites/goat.svg");
  k.loadSprite("title", import.meta.env.BASE_URL + "title.png");
  loadFonts(k);
  loadCrewAssets();
}
