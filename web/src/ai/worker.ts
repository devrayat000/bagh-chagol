// The AI runs in a Web Worker so that searching never freezes the game's frame loop.

import * as ort from "onnxruntime-web/wasm";
import { Game, State, type MapDef, type StateData } from "../rules";
import { NetEvaluator, RolloutEvaluator } from "./evaluators";
import { pickAction, search, type Evaluator } from "./mcts";

export type WorkerRequest =
  | { type: "load"; map: MapDef; modelUrl: string | null }
  | { type: "think"; id: number; state: StateData; sims: number; temperature: number };

export type WorkerResponse =
  | { type: "ready"; trained: boolean }
  | { type: "move"; id: number; action: number; value: number; visits: [number, number][] }
  | { type: "error"; message: string };

ort.env.wasm.numThreads = 1; // threads need cross-origin isolation, which static hosts rarely provide

let game: Game | null = null;
let evaluator: Evaluator | null = null;

const post = (msg: WorkerResponse) => self.postMessage(msg);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      game = new Game(msg.map);
      evaluator = null;
      if (msg.modelUrl) {
        try {
          const session = await ort.InferenceSession.create(msg.modelUrl, { executionProviders: ["wasm"] });
          evaluator = new NetEvaluator(session, ort.Tensor);
        } catch (err) {
          console.warn("could not load the network, falling back to playouts", err);
        }
      }
      evaluator ??= new RolloutEvaluator();
      post({ type: "ready", trained: evaluator instanceof NetEvaluator });
    } else if (msg.type === "think") {
      if (!game || !evaluator) throw new Error("no map loaded");
      const state = State.fromJSON(game, msg.state);
      const { visits, value } = await search(state, evaluator, msg.sims);
      const action = pickAction(visits, msg.temperature);
      post({ type: "move", id: msg.id, action, value, visits: [...visits] });
    }
  } catch (err) {
    post({ type: "error", message: String(err) });
  }
};
