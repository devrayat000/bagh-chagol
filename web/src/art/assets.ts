import { k } from "../engine";
import { ROOT } from "../site";
import { loadCrewAssets } from "./crew";
import { loadFonts } from "./fonts";

/** Queue every asset with kaplay's loader; scenes start from k.onLoad once all are ready. */
export function loadAssets() {
  k.loadSprite("tiger", ROOT + "sprites/tiger.svg");
  k.loadSprite("goat", ROOT + "sprites/goat.svg");
  k.loadSprite("title", ROOT + "title.png");
  loadFonts(k);
  loadCrewAssets();
}
