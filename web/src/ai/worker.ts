// The AI runs in a Web Worker so that searching never freezes the game's frame loop.

import * as ort from "onnxruntime-web/wasm";
import { FourRowRolloutEvaluator } from "../fourrow/evaluators";
import { FourRowState, type FourRowDef, type FourRowStateData } from "../fourrow/rules";
import { Game, State, type MapDef, type StateData } from "../rules";
import { NetEvaluator, RolloutEvaluator } from "./evaluators";
import { pickAction, search, type Evaluator, type SearchState } from "./mcts";

/** Which game to play: a bagh-chal map, or four-in-a-row. */
export type GameLoad = { game: "bagh"; map: MapDef } | { game: "fourrow"; def: FourRowDef };

export type WorkerRequest =
  | { type: "load"; load: GameLoad; modelUrl: string | null }
  | { type: "think"; id: number; state: StateData | FourRowStateData; sims: number; temperature: number };

export type WorkerResponse =
  | { type: "ready"; trained: boolean }
  | { type: "move"; id: number; action: number; value: number; visits: [number, number][] }
  | { type: "error"; message: string };

ort.env.wasm.numThreads = 1; // threads need cross-origin isolation, which static hosts rarely provide

let decode: ((data: StateData | FourRowStateData) => SearchState) | null = null;
let evaluator: Evaluator<never> | null = null;

const post = (msg: WorkerResponse) => self.postMessage(msg);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      const { load } = msg;
      if (load.game === "bagh") {
        const game = new Game(load.map);
        decode = (d) => State.fromJSON(game, d as StateData);
      } else {
        decode = (d) => FourRowState.fromJSON(load.def, d as FourRowStateData);
      }
      evaluator = null;
      if (msg.modelUrl) {
        try {
          const session = await ort.InferenceSession.create(msg.modelUrl, { executionProviders: ["wasm"] });
          evaluator = new NetEvaluator(session, ort.Tensor);
        } catch (err) {
          console.warn("could not load the network, falling back to playouts", err);
        }
      }
      evaluator ??= load.game === "bagh" ? new RolloutEvaluator() : new FourRowRolloutEvaluator();
      post({ type: "ready", trained: evaluator instanceof NetEvaluator });
    } else if (msg.type === "think") {
      if (!decode || !evaluator) throw new Error("no game loaded");
      const state = decode(msg.state);
      const { visits, value } = await search(state, evaluator as Evaluator<SearchState>, msg.sims);
      const action = pickAction(visits, msg.temperature);
      post({ type: "move", id: msg.id, action, value, visits: [...visits] });
    }
  } catch (err) {
    post({ type: "error", message: String(err) });
  }
};
