/**
 * Spaceships: the patterns that fly in from the margin so the Grid never dies down. Pure, headless.
 */
import type { CellMask } from "./cell-typesetter";
import type { LifeEngine, Point } from "./life-engine";

export type SpaceshipKind = "glider" | "lwss";

/** Each kind drawn flying towards its first heading in `HEADINGS`. */
const SHAPES: Record<SpaceshipKind, readonly string[]> = {
  glider: [".#.", "..#", "###"],
  lwss: ["#..#.", "....#", "#...#", ".####"],
};

/** The headings each kind can fly, as unit steps. Each is the previous rotated a quarter turn clockwise. */
export const HEADINGS: Record<SpaceshipKind, readonly Point[]> = {
  glider: [
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
  ],
  lwss: [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ],
};

/** A spaceship of `kind` flying towards `heading`, with (0,0) at its box's top-left. */
export function spaceship(kind: SpaceshipKind, heading: Point): CellMask {
  const turns = HEADINGS[kind].findIndex((h) => h.x === heading.x && h.y === heading.y);
  if (turns < 0) throw new Error(`A ${kind} can't fly towards (${heading.x}, ${heading.y})`);
  const rows = SHAPES[kind];
  let width = rows[0].length;
  let height = rows.length;
  let cells: Point[] = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => c === "#" && cells.push({ x, y })));
  for (let t = 0; t < turns; t++) {
    // A quarter turn clockwise (y down): (x, y) -> (height-1-y, x).
    cells = cells.map(({ x, y }) => ({ x: height - 1 - y, y: x }));
    [width, height] = [height, width];
  }
  return { width, height, cells };
}

/** The Grid dimensions a launch needs. */
export interface GridBounds {
  readonly width: number;
  readonly height: number;
}

/**
 * A random spaceship placed in the margin just off one edge, flying into the viewport.
 * The margin must be wider than a spaceship plus the dead outer ring.
 */
export function launchFromEdge({ width, height }: GridBounds, random: () => number = Math.random): Point[] {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const inward = pick([
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]);
  const kind: SpaceshipKind = random() < 0.6 ? "glider" : "lwss";
  // A glider flies diagonally: inward, plus a random sideways drift.
  const drift = pick([-1, 1]);
  const heading = kind === "glider" ? { x: inward.x || drift, y: inward.y || drift } : inward;
  const ship = spaceship(kind, heading);

  // Just off the edge it's flying in from, at a random spot along that edge.
  const along = (span: number, size: number) => Math.floor(random() * Math.max(1, span - size));
  const ox =
    inward.x === 1 ? -ship.width - 1 : inward.x === -1 ? width + 1 : along(width, ship.width);
  const oy =
    inward.y === 1 ? -ship.height - 1 : inward.y === -1 ? height + 1 : along(height, ship.height);
  return ship.cells.map((p) => ({ x: p.x + ox, y: p.y + oy }));
}

/**
 * Chance per tick that a spaceship flies in: about one every 30 ticks (3.6s at 120ms).
 * Without these, a Grid with no pinned content settles into still ash within 5 minutes.
 */
export const LAUNCH_CHANCE = 1 / 30;

/** Call once per tick: now and then, a spaceship flies in from a random edge. */
export function maybeLaunch(engine: LifeEngine, random: () => number = Math.random): void {
  if (random() < LAUNCH_CHANCE) engine.inject(launchFromEdge(engine, random));
}
