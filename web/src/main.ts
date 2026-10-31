import { AiClient } from "./ai/client";
import { loadAssets } from "./art/assets";
import { k } from "./engine";
import { fourRowMenuScene } from "./fourrow/menu";
import { fourRowPlayScene, type FourRowPlayArgs } from "./fourrow/play";
import { loadFourRow, loadFourRowSettings, loadMaps, loadSettings } from "./maps";
import { homeScene } from "./scenes/home";
import { menuScene } from "./scenes/menu";
import { playScene, type PlayArgs } from "./scenes/play";

/** The address bar follows the game you're in, so a shared or reloaded link opens it again. */
function setHash(hash: string) {
  history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
}

async function main() {
  loadAssets();
  const [maps, fourRow] = await Promise.all([loadMaps(), loadFourRow()]);
  const settings = loadSettings();
  const fourRowSettings = loadFourRowSettings();
  const ai = new AiClient();

  k.scene("home", () => (setHash(""), homeScene(fourRow.def)));
  k.scene("menu", () => (setHash("bagh"), menuScene(maps, settings, ai)));
  k.scene("play", (args: PlayArgs) => (setHash("bagh"), playScene(args)));
  k.scene("fourrow-menu", () => (setHash("fourrow"), fourRowMenuScene(fourRow, fourRowSettings, ai)));
  k.scene("fourrow-play", (args: FourRowPlayArgs) => (setHash("fourrow"), fourRowPlayScene(args)));

  const sceneFor = () => ({ "#bagh": "menu", "#fourrow": "fourrow-menu" })[location.hash] ?? "home";
  k.onLoad(() => {
    k.go(sceneFor());
    // A link to the other game pasted into the address bar, or the browser's back button.
    window.addEventListener("hashchange", () => k.go(sceneFor()));
  });
}

void main();
