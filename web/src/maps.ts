// Map definitions, exported from Python by export_web.py into public/maps/.

import type { MapDef, Side } from "./rules";
import type { Difficulty } from "./ai/client";
import type { Avatar } from "./art/crew";
import type { FourRowDef } from "./fourrow/rules";
import { ROOT } from "./site";

export interface MapEntry {
  def: MapDef;
  trained: boolean; // has a trained network (otherwise the AI uses playouts)
  modelUrl: string | null;
}

const BASE = ROOT + "maps/"; // absolute: the AI worker needs it

export async function loadMaps(): Promise<MapEntry[]> {
  const index: { id: string; trained: boolean }[] = await (await fetch(BASE + "index.json")).json();
  return Promise.all(
    index.map(async ({ id, trained }) => ({
      def: (await (await fetch(`${BASE}${id}/game.json`)).json()) as MapDef,
      trained,
      modelUrl: trained ? `${BASE}${id}/model.onnx` : null,
    })),
  );
}

export interface Settings {
  mapId: string;
  side: Side; // the side the human plays
  difficulty: Difficulty["id"];
}

const KEY = "bagh.settings";

export function loadSettings(): Settings {
  const fallback: Settings = { mapId: "hourglass", side: 1, difficulty: "medium" };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

// ----- four-in-a-row -----------------------------------------------------------

const FOURROW = ROOT + "fourrow/";

export interface FourRowEntry {
  def: FourRowDef;
  modelUrl: string | null;
}

export async function loadFourRow(): Promise<FourRowEntry> {
  const def: FourRowDef = await (await fetch(FOURROW + "game.json")).json();
  return { def, modelUrl: def.trained ? FOURROW + "model.onnx" : null };
}

export interface FourRowSettings {
  avatar: Avatar;
  side: Side; // 0 = you drop first (red)
  difficulty: Difficulty["id"];
}

const FOURROW_KEY = "fourrow.settings";

export function loadFourRowSettings(): FourRowSettings {
  const fallback: FourRowSettings = { avatar: "bean", side: 0, difficulty: "medium" };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(FOURROW_KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

export function saveFourRowSettings(s: FourRowSettings) {
  localStorage.setItem(FOURROW_KEY, JSON.stringify(s));
}
