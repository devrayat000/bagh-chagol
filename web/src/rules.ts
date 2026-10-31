// Rules of বাঘ-ছাগল - a line-for-line port of bagh/game.py.
//
// The board tables (steps, jumps, planes) come from game.json, written by
// export_web.py, so the browser and Python agree on the geometry exactly.
// tests/rules.test.ts checks this file against positions solved in Python.

export const EMPTY = 0, TIGER = 1, GOAT = 2;
export const TIGER_SIDE = 0, GOAT_SIDE = 1;
export type Side = 0 | 1;
export type Winner = Side | "draw" | null;
export const NUM_PLANES = 7;

export interface BoardDef {
  name: string;
  rows: number;
  cols: number;
  coords: [number, number][];
  lines: number[][];
  labels: string[];
  shading: number[][];
  gridLabels: boolean;
  steps: number[][];
  jumps: [number, number][][]; // per point: [over, land]
  pointMask: number[];
  degreePlane: number[];
}

export interface RulesDef {
  tigers: number[];
  goats: number[];
  capturesToWin: number;
  maxPlies: number;
  first: "tiger" | "goat";
}

export interface MapDef {
  id: string;
  title: string;
  blurb: string;
  board: BoardDef;
  rules: RulesDef;
}

/** Board tables in fast-lookup form, built once per map. */
export class Geometry {
  readonly points: number;
  readonly numActions: number;
  readonly cellOf: Int32Array;
  readonly jumpOver = new Map<number, number>(); // from * P + to -> jumped point

  constructor(readonly def: BoardDef) {
    this.points = def.coords.length;
    this.numActions = this.points * this.points;
    this.cellOf = Int32Array.from(def.coords, ([r, c]) => r * def.cols + c);
    def.jumps.forEach((js, from) => {
      for (const [over, land] of js) this.jumpOver.set(from * this.points + land, over);
    });
  }

  isJump(from: number, to: number): boolean {
    return this.jumpOver.has(from * this.points + to);
  }
}

export class Game {
  readonly geo: Geometry;
  constructor(readonly map: MapDef) {
    this.geo = new Geometry(map.board);
  }

  initial(): State {
    const board = new Int8Array(this.geo.points);
    for (const p of this.map.rules.tigers) board[p] = TIGER;
    for (const p of this.map.rules.goats) board[p] = GOAT;
    return new State(this, board, this.map.rules.first === "tiger" ? TIGER_SIDE : GOAT_SIDE, 0, 0);
  }
}

/** An immutable position. `apply` returns a new State. */
export class State {
  private _legal: number[] | null = null;
  private _winner: Winner | undefined = undefined;

  constructor(
    readonly game: Game,
    readonly board: Int8Array,
    readonly toPlay: Side,
    readonly captures: number,
    readonly ply: number,
  ) {}

  get geo(): Geometry {
    return this.game.geo;
  }

  legalActions(): number[] {
    if (this._legal === null) {
      const { points: P, def } = this.geo;
      const b = this.board;
      const actions: number[] = [];
      for (let f = 0; f < P; f++) {
        if (this.toPlay === TIGER_SIDE ? b[f] !== TIGER : b[f] !== GOAT) continue;
        for (const q of def.steps[f]) if (b[q] === EMPTY) actions.push(f * P + q);
        if (this.toPlay === TIGER_SIDE)
          for (const [over, land] of def.jumps[f])
            if (b[over] === GOAT && b[land] === EMPTY) actions.push(f * P + land);
      }
      this._legal = actions;
    }
    return this._legal;
  }

  isCapture(action: number): boolean {
    const P = this.geo.points;
    const from = Math.floor(action / P), to = action % P;
    return this.board[from] === TIGER && this.geo.isJump(from, to);
  }

  apply(action: number): State {
    const P = this.geo.points;
    const from = Math.floor(action / P), to = action % P;
    const board = this.board.slice();
    const piece = board[from];
    board[from] = EMPTY;
    board[to] = piece;
    let captures = this.captures;
    if (piece === TIGER && this.geo.isJump(from, to)) {
      board[this.geo.jumpOver.get(action)!] = EMPTY; // remove the jumped goat
      captures += 1;
    }
    return new State(this.game, board, (1 - this.toPlay) as Side, captures, this.ply + 1);
  }

  /** Same order of checks as Python: captures, then "can't move", then the move limit. */
  winner(): Winner {
    if (this._winner === undefined) {
      const rules = this.game.map.rules;
      if (this.captures >= rules.capturesToWin) this._winner = TIGER_SIDE;
      else if (this.legalActions().length === 0) this._winner = (1 - this.toPlay) as Side;
      else if (this.ply >= rules.maxPlies) this._winner = "draw";
      else this._winner = null;
    }
    return this._winner;
  }

  isTerminal(): boolean {
    return this.winner() !== null;
  }

  /** Network input, shape (7, rows, cols) flattened - identical to State.encode() in Python. */
  encode(out?: Float32Array): Float32Array {
    const { def, cellOf } = this.geo;
    const cells = def.rows * def.cols;
    const planes = out ?? new Float32Array(NUM_PLANES * cells);
    planes.fill(0, 0, 2 * cells);
    for (let p = 0; p < this.board.length; p++) {
      if (this.board[p] === TIGER) planes[cellOf[p]] = 1;
      else if (this.board[p] === GOAT) planes[cells + cellOf[p]] = 1;
    }
    const rules = this.game.map.rules;
    planes.fill(this.toPlay, 2 * cells, 3 * cells);
    planes.fill(this.captures / rules.capturesToWin, 3 * cells, 4 * cells);
    planes.fill(this.ply / rules.maxPlies, 4 * cells, 5 * cells);
    planes.set(def.pointMask, 5 * cells);
    planes.set(def.degreePlane, 6 * cells);
    return planes;
  }

  inputDims(): [number, number, number] {
    return [NUM_PLANES, this.geo.def.rows, this.geo.def.cols];
  }

  cacheKey(): string {
    return `${this.board.join("")}|${this.toPlay}|${this.captures}|${this.ply}`;
  }

  /** Plain-data form, for sending positions to the AI worker. */
  toJSON(): StateData {
    return { board: Array.from(this.board), toPlay: this.toPlay, captures: this.captures, ply: this.ply };
  }

  static fromJSON(game: Game, d: StateData): State {
    return new State(game, Int8Array.from(d.board), d.toPlay, d.captures, d.ply);
  }
}

export interface StateData {
  board: number[];
  toPlay: Side;
  captures: number;
  ply: number;
}

export function actionFrom(action: number, P: number): number {
  return Math.floor(action / P);
}
export function actionTo(action: number, P: number): number {
  return action % P;
}
