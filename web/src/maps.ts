// Map definitions, exported from Python by export_web.py into public/maps/.

import type { MapDef, Side } from "./rules";
import type { Difficulty } from "./ai/client";

export interface MapEntry {
  def: MapDef;
  trained: boolean; // has a trained network (otherwise the AI uses playouts)
  modelUrl: string | null;
}

const BASE = new URL(import.meta.env.BASE_URL + "maps/", document.baseURI).href; // absolute: the AI worker needs it

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
