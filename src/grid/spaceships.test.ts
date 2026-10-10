import { describe, expect, it } from "vitest";
import { LifeEngine, type Point } from "./life-engine";
import { HEADINGS, launchFromEdge, maybeLaunch, spaceship, spaceshipAt, type SpaceshipKind } from "./spaceships";
import { allLive, inViewport, mulberry32, soup } from "./test-support";

function centroid(points: Point[]): Point {
  const n = points.length;
  return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
}

describe("spaceship", () => {
  const cases = (Object.keys(HEADINGS) as SpaceshipKind[]).flatMap((kind) =>
    HEADINGS[kind].map((heading) => ({ kind, heading })),
  );

  it.each(cases)("$kind flies towards ($heading.x, $heading.y)", ({ kind, heading }) => {
    const engine = new LifeEngine({ width: 40, height: 40, margin: 4 });
    const ship = spaceship(kind, heading);
    engine.inject(ship.cells.map((p) => ({ x: p.x + 18, y: p.y + 18 })));
    const start = centroid(allLive(engine));
    for (let t = 0; t < 8; t++) engine.step();
    const live = allLive(engine);
    expect(live).toHaveLength(ship.cells.length);
    const end = centroid(live);
    expect(Math.sign(Math.round(end.x - start.x))).toBe(heading.x);
    expect(Math.sign(Math.round(end.y - start.y))).toBe(heading.y);
  });

  it("rejects a heading the kind can't fly", () => {
    expect(() => spaceship("glider", { x: 1, y: 0 })).toThrow();
    expect(() => spaceship("lwss", { x: 1, y: 1 })).toThrow();
  });
});

describe("spaceshipAt", () => {
  it("centres a spaceship's box on the given Cell", () => {
    const cells = spaceshipAt("glider", { x: 10, y: 20 }, mulberry32(1));
    expect(cells).toHaveLength(5);
    for (const p of cells) {
      expect(Math.abs(p.x - 10)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y - 20)).toBeLessThanOrEqual(1);
    }
  });
});

describe("maybeLaunch", () => {
  const FIVE_MINUTES = 2500; // ticks at 120ms
  const WINDOW = 200;

  /**
   * Run soup with no pinned content for 5 minutes, then count births over the last
   * WINDOW ticks in Cells that hadn't been alive for 15 ticks. Oscillating ash
   * (blinkers and the like) never counts, only things moving into new ground.
   */
  function lateNovelBirths(width: number, height: number, seed: number, launch: boolean): number {
    const random = mulberry32(seed);
    const engine = new LifeEngine({ width, height, margin: 12 });
    engine.inject(soup(engine, 0.09, random));
    const lastAlive = new Int32Array(width * height).fill(-1000);
    let births = 0;
    for (let t = 0; t < FIVE_MINUTES; t++) {
      if (launch) maybeLaunch(engine, random);
      engine.step();
      if (t < FIVE_MINUTES - WINDOW - 15) continue;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!engine.isAlive(x, y)) continue;
          const i = y * width + x;
          if (t >= FIVE_MINUTES - WINDOW && t - lastAlive[i] > 15) births++;
          lastAlive[i] = t;
        }
      }
    }
    return births;
  }

  const runs = [
    { width: 150, height: 85, seed: 1 },
    { width: 150, height: 85, seed: 2 },
    { width: 60, height: 140, seed: 3 },
    { width: 60, height: 140, seed: 4 },
  ];

  it.each(runs)("keeps a $width×$height Grid visibly active after 5 minutes (seed $seed)", ({ width, height, seed }) => {
    expect(lateNovelBirths(width, height, seed, true)).toBeGreaterThan(100);
  });

  it("is what keeps it active: without launches the same soup has settled", () => {
    expect(lateNovelBirths(150, 85, 1, false)).toBe(0);
  });
});

describe("launchFromEdge", () => {
  it("places a spaceship wholly in the margin, and it enters the viewport", () => {
    const rng = mulberry32(7);
    for (let trial = 0; trial < 40; trial++) {
      const engine = new LifeEngine({ width: 60, height: 40, margin: 12 });
      const cells = launchFromEdge(engine, rng);
      expect(cells.length).toBeGreaterThan(0);
      for (const p of cells) expect(inViewport(engine, p)).toBe(false);
      engine.inject(cells);
      let entered = false;
      for (let t = 0; t < 40 && !entered; t++) {
        engine.step();
        entered = allLive(engine).some((p) => inViewport(engine, p));
      }
      expect(entered).toBe(true);
    }
  });
});
