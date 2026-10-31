// Main-thread side of the AI worker: a promise-based wrapper.

import type { GameLoad, WorkerRequest, WorkerResponse } from "./worker";

/** Any position the worker can rebuild: bagh State or FourRowState. */
interface Sendable {
  toJSON(): Extract<WorkerRequest, { type: "think" }>["state"];
}

export interface Difficulty {
  id: "easy" | "medium" | "hard";
  label: string;
  sims: number; // search simulations per move
  temperature: number; // 0 = always the best move; higher = more human mistakes
}

export const DIFFICULTIES: Difficulty[] = [
  { id: "easy", label: "Easy", sims: 12, temperature: 0.8 },
  { id: "medium", label: "Medium", sims: 80, temperature: 0.15 },
  { id: "hard", label: "Hard", sims: 400, temperature: 0 },
];

export interface AiMove {
  action: number;
  value: number; // how the AI rates its position, -1 (lost) .. +1 (won)
}

export class AiClient {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  private nextId = 0;
  private pending = new Map<number, (m: AiMove) => void>();
  private onReady: ((trained: boolean) => void) | null = null;
  trained = false;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "ready") {
        this.trained = msg.trained;
        this.onReady?.(msg.trained);
      } else if (msg.type === "move") {
        this.pending.get(msg.id)?.({ action: msg.action, value: msg.value });
        this.pending.delete(msg.id);
      } else {
        console.error("AI worker:", msg.message);
      }
    };
  }

  load(load: GameLoad, modelUrl: string | null): Promise<boolean> {
    return new Promise((resolve) => {
      this.onReady = resolve;
      this.send({ type: "load", load, modelUrl });
    });
  }

  think(state: Sendable, difficulty: Difficulty): Promise<AiMove> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.send({ type: "think", id, state: state.toJSON(), sims: difficulty.sims, temperature: difficulty.temperature });
    });
  }

  /** Forget answers still in flight (e.g. after undo or restart). */
  cancelAll() {
    this.pending.clear();
  }

  private send(msg: WorkerRequest) {
    this.worker.postMessage(msg);
  }
}
