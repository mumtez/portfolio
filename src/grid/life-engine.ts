/**
 * Life Engine: the Grid's state and rules, headless (no DOM, no canvas).
 *
 * Coordinates are viewport cells: (0,0) is the top-left visible Cell. The Grid
 * extends `margin` cells beyond the viewport on every side; those Cells run
 * normally but aren't drawn. The outermost ring of the margin is always dead,
 * so nothing wraps, and a margin Cell that has been alive too much lately dies
 * (see `MARGIN_MAX_HEAT`), so patterns that leave are discarded instead of
 * leaving debris against the dead ring.
 *
 * Walls (a Section's Frames) are dead Cells: they never come alive, so they count as
 * dead neighbours and absorb whatever flies into them. A wall wins over a pin: a
 * Pinned Cell inside a wall is dead until the wall goes.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** What a Cell looks like to the renderer. Classification only; the rules don't use it. */
export const CellKind = {
  Dead: 0,
  /** A dead Cell that died recently and is still fading. Never in the Fringe. */
  Ghost: 1,
  Free: 2,
  /** A live Free Cell touching a Pinned Cell, continually reborn. */
  Fringe: 3,
  Pinned: 4,
  /** Inside a wall (a Frame): always dead, and covered by real media on the page. */
  Wall: 5,
} as const;
export type CellKind = (typeof CellKind)[keyof typeof CellKind];

/** Ghost brightness is multiplied by this each tick after a Cell dies. */
const GHOST_DECAY = 0.72;
/** Below this, a ghost is no longer drawn. */
const GHOST_FLOOR = 0.05;
/**
 * Each margin Cell's heat is multiplied by `MARGIN_HEAT_DECAY` every tick, plus 1 if
 * it's alive, and a margin Cell whose heat would pass `MARGIN_MAX_HEAT` dies instead.
 * A passing glider or LWSS heats no Cell past 4.2, so spaceships fly through the
 * margin untouched. A still life passes 4.5 on its 6th tick, and a Cell alive every
 * other tick (a blinker's ends) or in 4 of every 5 peaks above it too, so debris and
 * oscillating ash there die. (Counting only consecutive ticks alive missed the
 * oscillators.)
 */
const MARGIN_HEAT_DECAY = 0.9;
const MARGIN_MAX_HEAT = 4.5;

export interface LifeEngineOptions {
  /** Viewport width in cells. */
  readonly width: number;
  /** Viewport height in cells. */
  readonly height: number;
  /** Off-screen cells on every side of the viewport. */
  readonly margin: number;
}

export class LifeEngine {
  readonly width: number;
  readonly height: number;
  readonly margin: number;

  private readonly stride: number;
  private readonly rows: number;
  private alive: Uint8Array;
  private next: Uint8Array;
  private readonly pinned: Uint8Array;
  /** 1 for wall Cells (Frames). */
  private readonly wall: Uint8Array;
  /** 1 where a non-pinned Cell touches a Pinned Cell. */
  private readonly fringe: Uint8Array;
  /** 1 while alive, then decays towards 0 after death. */
  private readonly ghost: Float32Array;
  /** 1 for Cells in the margin. */
  private readonly inMargin: Uint8Array;
  /** How much each margin Cell has been alive lately; see `MARGIN_MAX_HEAT`. */
  private readonly heat: Float32Array;

  constructor({ width, height, margin }: LifeEngineOptions) {
    this.width = width;
    this.height = height;
    this.margin = margin;
    this.stride = width + 2 * margin;
    this.rows = height + 2 * margin;
    this.alive = new Uint8Array(this.stride * this.rows);
    this.next = new Uint8Array(this.stride * this.rows);
    this.pinned = new Uint8Array(this.stride * this.rows);
    this.wall = new Uint8Array(this.stride * this.rows);
    this.fringe = new Uint8Array(this.stride * this.rows);
    this.ghost = new Float32Array(this.stride * this.rows);
    this.heat = new Float32Array(this.stride * this.rows);
    this.inMargin = new Uint8Array(this.stride * this.rows).fill(1);
    for (let y = 0; y < height; y++) this.inMargin.fill(0, this.index(0, y), this.index(width, y));
  }

  /**
   * Replace the pinned content. Pinned Cells are alive and stay alive; Cells that
   * were pinned before and aren't now are released as Free Cells.
   */
  setPinned(points: Iterable<Point>): void {
    this.pinned.fill(0);
    for (const p of points) {
      const i = this.index(p.x, p.y);
      if (i < 0) continue;
      this.pinned[i] = 1;
      this.revive(i);
    }
    this.classifyFringe();
  }

  /**
   * Replace the walls (Frames). Cells inside a wall die at once and leave no ghost; a
   * Pinned Cell whose wall goes comes back to life.
   */
  setWalls(points: Iterable<Point>): void {
    const { wall, pinned, alive, ghost } = this;
    for (let i = 0; i < wall.length; i++) if (wall[i] && pinned[i]) alive[i] = ghost[i] = 1;
    wall.fill(0);
    for (const p of points) {
      const i = this.index(p.x, p.y);
      if (i < 0) continue;
      wall[i] = 1;
      alive[i] = 0;
      ghost[i] = 0;
    }
    this.classifyFringe();
  }

  /** Bring Free Cells to life. Points outside the Grid or inside a wall are ignored. */
  inject(points: Iterable<Point>): void {
    for (const p of points) {
      const i = this.index(p.x, p.y);
      if (i >= 0) this.revive(i);
    }
  }

  /** Advance one tick of B3/S23. */
  step(): void {
    const { stride: W, rows: H, alive: a, next, pinned, wall, inMargin, heat } = this;
    next.fill(0);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (wall[i]) continue;
        if (pinned[i]) {
          next[i] = 1;
          continue;
        }
        const n =
          a[i - W - 1] + a[i - W] + a[i - W + 1] + a[i - 1] + a[i + 1] + a[i + W - 1] + a[i + W] + a[i + W + 1];
        const lives = n === 3 || (n === 2 && a[i]) ? 1 : 0;
        if (inMargin[i]) {
          heat[i] = heat[i] * MARGIN_HEAT_DECAY + lives;
          next[i] = heat[i] > MARGIN_MAX_HEAT ? 0 : lives;
        } else {
          next[i] = lives;
        }
      }
    }
    this.next = a;
    this.alive = next;
    const ghost = this.ghost;
    for (let i = 0; i < next.length; i++) ghost[i] = next[i] ? 1 : ghost[i] * GHOST_DECAY;
  }

  isAlive(x: number, y: number): boolean {
    const i = this.index(x, y);
    return i >= 0 && this.alive[i] === 1;
  }

  isPinned(x: number, y: number): boolean {
    const i = this.index(x, y);
    return i >= 0 && this.pinned[i] === 1 && this.wall[i] === 0;
  }

  kindAt(x: number, y: number): CellKind {
    const i = this.index(x, y);
    if (i < 0) return CellKind.Dead;
    if (this.wall[i]) return CellKind.Wall;
    if (this.pinned[i]) return CellKind.Pinned;
    if (this.alive[i]) return this.fringe[i] ? CellKind.Fringe : CellKind.Free;
    if (!this.fringe[i] && this.ghost[i] > GHOST_FLOOR) return CellKind.Ghost;
    return CellKind.Dead;
  }

  /** Ghost brightness in (0, 1]: 1 while alive, fading after death. */
  ghostAt(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? 0 : this.ghost[i];
  }

  private revive(i: number): void {
    if (this.wall[i]) return;
    this.alive[i] = 1;
    this.ghost[i] = 1;
  }

  private classifyFringe(): void {
    const { stride: W, rows: H, pinned, wall, fringe } = this;
    fringe.fill(0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!pinned[y * W + x] || wall[y * W + x]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = ny * W + nx;
            if (!pinned[j]) fringe[j] = 1;
          }
        }
      }
    }
  }

  /** Array index of a viewport coordinate, or -1 if it's outside the Grid. */
  private index(x: number, y: number): number {
    const gx = x + this.margin;
    const gy = y + this.margin;
    if (gx < 0 || gy < 0 || gx >= this.stride || gy >= this.rows) return -1;
    return gy * this.stride + gx;
  }
}
