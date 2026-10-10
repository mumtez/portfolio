/**
 * Helpers shared by the Grid's unit tests.
 */
import type { LifeEngine, Point } from "./life-engine";

/** Live cells anywhere in the Grid, margin included. */
export function allLive(engine: LifeEngine): Point[] {
  const out: Point[] = [];
  const m = engine.margin;
  for (let y = -m; y < engine.height + m; y++) {
    for (let x = -m; x < engine.width + m; x++) {
      if (engine.isAlive(x, y)) out.push({ x, y });
    }
  }
  return out;
}

export function inViewport(engine: LifeEngine, p: Point): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < engine.width && p.y < engine.height;
}

/** Soup over the whole Grid, margin included: each Cell alive with chance `density`. */
export function soup(engine: LifeEngine, density: number, random: () => number): Point[] {
  const out: Point[] = [];
  const m = engine.margin;
  for (let y = -m; y < engine.height + m; y++) {
    for (let x = -m; x < engine.width + m; x++) if (random() < density) out.push({ x, y });
  }
  return out;
}

/** A seeded RNG so the tests are repeatable. */
export function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
