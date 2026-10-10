/**
 * Intro Seed pools: starting patterns that become the name under strict B3/S23.
 *
 * Copied from the prototype's seed search on branch `prototype/gol-portfolio`
 * (`seeds.js`, ADR 0003). They are data, never regenerated here: each seed only
 * fits its exact name layout, so changing a name glyph means re-running the search.
 */
import { boxContains, type Box, type NameLayout } from "./cell-typesetter";
import type { Point } from "./life-engine";
import pools from "./intro-seeds.json";

export interface IntroSeed {
  /** Offset of the seed's top-left from the name's top-left (−depth on each axis). */
  readonly dx: number;
  readonly dy: number;
  /** The seed as rows of '#' (alive) and '.' (dead). */
  readonly rows: readonly string[];
}

export interface IntroSeedPool {
  /** Strict generations from any seed in the pool to the name. */
  readonly depth: number;
  readonly seeds: readonly IntroSeed[];
}

export const INTRO_SEEDS: Readonly<Record<NameLayout, IntroSeedPool>> = pools;

/**
 * Dead cells kept between the seed's box and the soup. Influence travels one cell
 * per generation, so with this gap the soup can't reach the name, or the border
 * of this width around it, before the seed has finished forming it.
 */
export const SOUP_CLEARANCE = 2;

export interface IntroSoup {
  /** Where soup may go (usually the whole Grid, margin included). */
  readonly area: Box;
  /** Chance that a soup Cell starts alive. */
  readonly density: number;
  readonly random: () => number;
}

/** Fraction of the seed's box that is alive, so surrounding soup can match it. */
export function seedDensity(seed: IntroSeed): number {
  let alive = 0;
  for (const row of seed.rows) for (const ch of row) if (ch === "#") alive++;
  return alive / (seed.rows.length * seed.rows[0].length);
}

/** Random soup across `area`, leaving `keepClear` (if given) empty. */
export function soupCells({ area, density, random }: IntroSoup, keepClear?: Box): Point[] {
  const cells: Point[] = [];
  for (let y = area.y; y < area.y + area.height; y++) {
    for (let x = area.x; x < area.x + area.width; x++) {
      if (keepClear && boxContains(keepClear, { x, y })) continue;
      if (random() < density) cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * The Intro's first generation: `seed` placed for a name at `name`, plus optional
 * soup across `soup.area` kept `SOUP_CLEARANCE` cells outside the seed's box.
 */
export function introCells(seed: IntroSeed, name: Box, soup?: IntroSoup): Point[] {
  const x0 = name.x + seed.dx;
  const y0 = name.y + seed.dy;
  const cells: Point[] = [];
  seed.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "#") cells.push({ x: x0 + x, y: y0 + y });
  });
  if (!soup) return cells;

  const clear: Box = {
    x: x0 - SOUP_CLEARANCE,
    y: y0 - SOUP_CLEARANCE,
    width: seed.rows[0].length + 2 * SOUP_CLEARANCE,
    height: seed.rows.length + 2 * SOUP_CLEARANCE,
  };
  return cells.concat(soupCells(soup, clear));
}
