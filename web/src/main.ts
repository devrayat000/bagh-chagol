import { AiClient } from "./ai/client";
import { loadAssets } from "./art/assets";
import { k } from "./engine";
import { loadMaps, loadSettings } from "./maps";
import { menuScene } from "./scenes/menu";
import { playScene, type PlayArgs } from "./scenes/play";

async function main() {
  loadAssets();
  const maps = await loadMaps();
  const settings = loadSettings();
  const ai = new AiClient();

  k.scene("menu", () => menuScene(maps, settings, ai));
  k.scene("play", (args: PlayArgs) => playScene(args));
  k.onLoad(() => k.go("menu"));
}

void main();
