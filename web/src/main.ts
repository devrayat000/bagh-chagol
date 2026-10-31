import { AiClient } from "./ai/client";
import { loadAssets } from "./art/assets";
import { k } from "./engine";
import { fourRowMenuScene } from "./fourrow/menu";
import { fourRowPlayScene, type FourRowPlayArgs } from "./fourrow/play";
import { loadFourRow, loadFourRowSettings, loadMaps, loadSettings } from "./maps";
import { homeScene } from "./scenes/home";
import { menuScene } from "./scenes/menu";
import { playScene, type PlayArgs } from "./scenes/play";
import { pageFromHash, showPage, startPage, type Page } from "./site";

const SCENE: Record<Page, string> = { home: "home", bagh: "menu", fourrow: "fourrow-menu" };

async function main() {
  loadAssets();
  const [maps, fourRow] = await Promise.all([loadMaps(), loadFourRow()]);
  const settings = loadSettings();
  const fourRowSettings = loadFourRowSettings();
  const ai = new AiClient();

  // Every scene puts its game's own address in the address bar (/, /bagh-chagol/, /four-in-a-row/).
  k.scene("home", () => (showPage("home"), homeScene(fourRow.def)));
  k.scene("menu", () => (showPage("bagh"), menuScene(maps, settings, ai)));
  k.scene("play", (args: PlayArgs) => (showPage("bagh"), playScene(args)));
  k.scene("fourrow-menu", () => (showPage("fourrow"), fourRowMenuScene(fourRow, fourRowSettings, ai)));
  k.scene("fourrow-play", (args: FourRowPlayArgs) => (showPage("fourrow"), fourRowPlayScene(args)));

  k.onLoad(() => {
    k.go(SCENE[pageFromHash() ?? startPage]);
    // An old #bagh / #fourrow link pasted into the address bar.
    window.addEventListener("hashchange", () => {
      const page = pageFromHash();
      if (page) k.go(SCENE[page]);
    });
  });
}

void main();
