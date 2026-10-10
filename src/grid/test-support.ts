/**
 * Helpers shared by the Grid's unit tests.
 */
import type { Box } from "./cell-typesetter";
import type { LifeEngine, Point } from "./life-engine";
import type { GridContent } from "./routes";

/** Content shaped like the site's: five top-level Sections in nav order, then the Deep Dives. */
export const TEST_CONTENT: GridContent = {
  sections: [
    { path: "/", nav: "Home", heading: "Andrew Aburustum" },
    { path: "/about/", nav: "About", heading: "About" },
    { path: "/experience/", nav: "Experience", heading: "Experience" },
    { path: "/projects/", nav: "Projects", heading: "Projects" },
    { path: "/contact/", nav: "Contact", heading: "Contact" },
    { path: "/projects/roborebels/", heading: "FTC RoboRebels" },
    { path: "/projects/baja/", heading: "Baja fuel-level estimator" },
    { path: "/projects/ftc-event-viewer/", heading: "FTC Event Viewer" },
  ],
};

/** The cells of `cells` inside `box`, as '#'/'.' rows trimmed to their own bounding box. */
export function rowsIn(cells: readonly Point[], box: Box): string[] {
  const inside = cells.filter(
    (c) => c.x >= box.x && c.x < box.x + box.width && c.y >= box.y && c.y < box.y + box.height,
  );
  if (!inside.length) return [];
  const xs = inside.map((c) => c.x);
  const ys = inside.map((c) => c.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const rows = Array.from({ length: Math.max(...ys) - y0 + 1 }, () =>
    Array<string>(Math.max(...xs) - x0 + 1).fill("."),
  );
  for (const c of inside) rows[c.y - y0][c.x - x0] = "#";
  return rows.map((r) => r.join(""));
}

/** True when two boxes share any cell. */
export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function boxInside(inner: Box, outer: { width: number; height: number }): boolean {
  return inner.x >= 0 && inner.y >= 0 && inner.x + inner.width <= outer.width && inner.y + inner.height <= outer.height;
}

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
