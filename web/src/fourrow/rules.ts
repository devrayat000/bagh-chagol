// Rules of four-in-a-row - a port of fourrow/game.py.
//
// The grid is stored row-major with row 0 at the TOP (as printed in Python);
// pieces stack up from row rows-1. An action is a column index.
// tests/fourrow.test.ts checks this file against positions from Python.

export type Side = 0 | 1;
export type Winner = Side | "draw" | null;
export const NUM_PLANES = 3;
export const RED = 0, YELLOW = 1; // side 0 (red) moves first

/** public/fourrow/game.json, written by export_web.py. */
export interface FourRowDef {
  id: "fourrow";
  rows: number;
  cols: number;
  connect: number;
  trained: boolean; // has a trained network (otherwise the AI uses playouts)
  iteration: number;
}

const DIRECTIONS: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]]; // horizontal, vertical, two diagonals

/** An immutable position. `apply` returns a new FourRowState. */
export class FourRowState {
  private _legal: number[] | null = null;
  private _winner: Winner | undefined = undefined;
  readonly heights: Int8Array; // pieces in each column

  constructor(
    readonly def: FourRowDef,
    readonly grid: Int8Array, // rows * cols cells: 0 empty, 1 red (side 0), 2 yellow (side 1)
    readonly toPlay: Side,
    readonly ply: number,
    readonly last: number = -1, // cell of the last piece dropped, -1 at the start
  ) {
    this.heights = new Int8Array(def.cols);
    for (let c = 0; c < def.cols; c++) {
      let h = 0;
      while (h < def.rows && grid[(def.rows - 1 - h) * def.cols + c] !== 0) h++;
      this.heights[c] = h;
    }
  }

  static initial(def: FourRowDef): FourRowState {
    return new FourRowState(def, new Int8Array(def.rows * def.cols), RED, 0);
  }

  legalActions(): number[] {
    if (this._legal === null) {
      this._legal = [];
      for (let c = 0; c < this.def.cols; c++) if (this.heights[c] < this.def.rows) this._legal.push(c);
    }
    return this._legal;
  }

  /** The row a piece dropped into `col` lands on. */
  landingRow(col: number): number {
    return this.def.rows - 1 - this.heights[col];
  }

  apply(col: number): FourRowState {
    if (this.heights[col] >= this.def.rows) throw new Error(`column ${col} is full`);
    const cell = this.landingRow(col) * this.def.cols + col;
    const grid = this.grid.slice();
    grid[cell] = this.toPlay + 1;
    return new FourRowState(this.def, grid, (1 - this.toPlay) as Side, this.ply + 1, cell);
  }

  winner(): Winner {
    if (this._winner === undefined) {
      if (this.last >= 0 && this.winningCells().length) this._winner = (1 - this.toPlay) as Side; // the player who just moved
      else if (this.ply >= this.def.rows * this.def.cols) this._winner = "draw";
      else this._winner = null;
    }
    return this._winner;
  }

  isTerminal(): boolean {
    return this.winner() !== null;
  }

  /** Cells of every long-enough line through the last piece (empty if it made none). */
  winningCells(): number[] {
    if (this.last < 0) return [];
    const { rows, cols, connect } = this.def;
    const row = Math.floor(this.last / cols), col = this.last % cols;
    const piece = this.grid[this.last];
    const cells: number[] = [];
    for (const [dr, dc] of DIRECTIONS) {
      const line = [this.last];
      for (const sign of [1, -1]) {
        let r = row + sign * dr, c = col + sign * dc;
        while (r >= 0 && r < rows && c >= 0 && c < cols && this.grid[r * cols + c] === piece) {
          line.push(r * cols + c);
          r += sign * dr;
          c += sign * dc;
        }
      }
      if (line.length >= connect) cells.push(...line);
    }
    return [...new Set(cells)];
  }

  /** Network input, shape (3, rows, cols) flattened - identical to State.encode() in Python:
   *  own pieces, opponent pieces, side to move. */
  encode(): Float32Array {
    const n = this.def.rows * this.def.cols;
    const planes = new Float32Array(NUM_PLANES * n);
    const own = this.toPlay + 1, opp = 2 - this.toPlay;
    for (let i = 0; i < n; i++) {
      if (this.grid[i] === own) planes[i] = 1;
      else if (this.grid[i] === opp) planes[n + i] = 1;
    }
    planes.fill(this.toPlay, 2 * n, 3 * n);
    return planes;
  }

  inputDims(): [number, number, number] {
    return [NUM_PLANES, this.def.rows, this.def.cols];
  }

  cacheKey(): string {
    return this.grid.join(""); // the side to move follows from the number of pieces
  }

  /** Plain-data form, for sending positions to the AI worker. */
  toJSON(): FourRowStateData {
    return { grid: Array.from(this.grid), toPlay: this.toPlay, ply: this.ply, last: this.last };
  }

  static fromJSON(def: FourRowDef, d: FourRowStateData): FourRowState {
    return new FourRowState(def, Int8Array.from(d.grid), d.toPlay, d.ply, d.last);
  }
}

export interface FourRowStateData {
  grid: number[];
  toPlay: Side;
  ply: number;
  last: number;
}
