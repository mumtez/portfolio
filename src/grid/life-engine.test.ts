import { describe, expect, it } from "vitest";
import { CellKind, LifeEngine, type Point } from "./life-engine";
import { HEADINGS, spaceship, type SpaceshipKind } from "./spaceships";

const BLOCK: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

/** Live cells (Free or Pinned) in the viewport, as sorted "x,y" keys. */
function liveCells(engine: LifeEngine): string[] {
  const out: string[] = [];
  for (let y = 0; y < engine.height; y++) {
    for (let x = 0; x < engine.width; x++) {
      if (engine.isAlive(x, y)) out.push(`${x},${y}`);
    }
  }
  return out.sort();
}

const keys = (points: Point[], dx = 0, dy = 0) => points.map((p) => `${p.x + dx},${p.y + dy}`).sort();

describe("LifeEngine", () => {
  it("leaves a block unchanged", () => {
    const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
    const block = BLOCK.map((p) => ({ x: p.x + 4, y: p.y + 4 }));
    engine.inject(block);
    engine.step();
    engine.step();
    expect(liveCells(engine)).toEqual(keys(block));
  });

  it("oscillates a blinker with period 2", () => {
    const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
    const horizontal = [{ x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }];
    const vertical = [{ x: 4, y: 3 }, { x: 4, y: 4 }, { x: 4, y: 5 }];
    engine.inject(horizontal);
    engine.step();
    expect(liveCells(engine)).toEqual(keys(vertical));
    engine.step();
    expect(liveCells(engine)).toEqual(keys(horizontal));
  });

  it("moves a glider (1,1) every 4 ticks", () => {
    const engine = new LifeEngine({ width: 20, height: 20, margin: 2 });
    const glider = [{ x: 1, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }].map((p) => ({
      x: p.x + 3,
      y: p.y + 3,
    }));
    engine.inject(glider);
    for (let t = 0; t < 4; t++) engine.step();
    expect(liveCells(engine)).toEqual(keys(glider, 1, 1));
    for (let t = 0; t < 4; t++) engine.step();
    expect(liveCells(engine)).toEqual(keys(glider, 2, 2));
  });

  describe("Pinned Cells", () => {
    it("never die, even when isolated", () => {
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      engine.setPinned([{ x: 5, y: 5 }]);
      for (let t = 0; t < 5; t++) engine.step();
      expect(engine.isAlive(5, 5)).toBe(true);
      expect(engine.isPinned(5, 5)).toBe(true);
    });

    it("count as live neighbours for Free Cells", () => {
      // Two Pinned Cells plus one Free Cell in a row: the middle-adjacent dead Cells
      // above and below have exactly 3 live neighbours and are born.
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      engine.setPinned([{ x: 3, y: 5 }, { x: 4, y: 5 }]);
      engine.inject([{ x: 5, y: 5 }]);
      engine.step();
      expect(engine.isAlive(4, 4)).toBe(true);
      expect(engine.isAlive(4, 6)).toBe(true);
      expect(engine.isPinned(4, 4)).toBe(false);
    });

    it("are replaced, not accumulated, by a new pinned set", () => {
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      engine.setPinned([{ x: 2, y: 2 }]);
      engine.setPinned([{ x: 7, y: 7 }]);
      expect(engine.isPinned(2, 2)).toBe(false);
      expect(engine.isPinned(7, 7)).toBe(true);
    });
  });

  describe("readout", () => {
    it("classifies Free Cells touching a Pinned Cell (including diagonally) as Fringe", () => {
      const engine = new LifeEngine({ width: 12, height: 12, margin: 2 });
      engine.setPinned([{ x: 5, y: 5 }]);
      engine.inject([{ x: 6, y: 6 }, { x: 4, y: 5 }, { x: 8, y: 5 }, { x: 5, y: 7 }]);
      expect(engine.kindAt(5, 5)).toBe(CellKind.Pinned);
      expect(engine.kindAt(6, 6)).toBe(CellKind.Fringe);
      expect(engine.kindAt(4, 5)).toBe(CellKind.Fringe);
      expect(engine.kindAt(8, 5)).toBe(CellKind.Free);
      expect(engine.kindAt(5, 7)).toBe(CellKind.Free);
      expect(engine.kindAt(1, 1)).toBe(CellKind.Dead);
    });

    it("keeps Fringe classification for Cells reborn next to pinned content", () => {
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      engine.setPinned([{ x: 3, y: 5 }, { x: 4, y: 5 }]);
      engine.inject([{ x: 5, y: 5 }]);
      engine.step();
      expect(engine.kindAt(4, 4)).toBe(CellKind.Fringe);
    });

    it("leaves a fading ghost where a Free Cell died", () => {
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      engine.inject([{ x: 5, y: 5 }]);
      engine.step();
      expect(engine.kindAt(5, 5)).toBe(CellKind.Ghost);
      const first = engine.ghostAt(5, 5);
      expect(first).toBeGreaterThan(0);
      expect(first).toBeLessThan(1);
      engine.step();
      expect(engine.ghostAt(5, 5)).toBeLessThan(first);
      for (let t = 0; t < 30; t++) engine.step();
      expect(engine.kindAt(5, 5)).toBe(CellKind.Dead);
    });

    it("draws no ghosts in the Fringe, so pinned content stays clean", () => {
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      engine.setPinned([{ x: 5, y: 5 }]);
      engine.inject([{ x: 6, y: 5 }]);
      engine.step();
      expect(engine.isAlive(6, 5)).toBe(false);
      expect(engine.kindAt(6, 5)).toBe(CellKind.Dead);
    });
  });

  describe("margin discard", () => {
    /** Live cells anywhere in the Grid, margin included. */
    function allLive(engine: LifeEngine): string[] {
      const out: string[] = [];
      const m = engine.margin;
      for (let y = -m; y < engine.height + m; y++) {
        for (let x = -m; x < engine.width + m; x++) {
          if (engine.isAlive(x, y)) out.push(`${x},${y}`);
        }
      }
      return out;
    }

    const ships = (Object.keys(HEADINGS) as SpaceshipKind[]).flatMap((kind) =>
      HEADINGS[kind].flatMap((heading) => [0, 1, 2, 3].map((phase) => ({ kind, heading, phase }))),
    );

    it.each(ships)(
      "discards a $kind flying towards ($heading.x, $heading.y), phase $phase, leaving no debris",
      ({ kind, heading, phase }) => {
        const engine = new LifeEngine({ width: 30, height: 30, margin: 12 });
        const ship = spaceship(kind, heading);
        engine.inject(ship.cells.map((p) => ({ x: p.x + 13 + heading.x * phase, y: p.y + 13 + heading.y * phase })));
        for (let t = 0; t < phase; t++) engine.step();
        for (let t = 0; t < 200; t++) engine.step();
        expect(allLive(engine)).toEqual([]);
      },
    );

    it("clears still lifes left in the margin", () => {
      const engine = new LifeEngine({ width: 10, height: 10, margin: 6 });
      engine.inject(BLOCK.map((p) => ({ x: p.x - 4, y: p.y + 3 })));
      for (let t = 0; t < 10; t++) engine.step();
      expect(allLive(engine)).toEqual([]);
    });

    it("leaves still lifes in the viewport alone", () => {
      const engine = new LifeEngine({ width: 10, height: 10, margin: 6 });
      const block = BLOCK.map((p) => ({ x: p.x, y: p.y }));
      engine.inject(block);
      for (let t = 0; t < 10; t++) engine.step();
      expect(liveCells(engine)).toEqual(keys(block));
    });
  });

  it("lets a glider fly off through the margin without wrapping back into view", () => {
    const engine = new LifeEngine({ width: 8, height: 8, margin: 3 });
    const glider = [{ x: 1, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }];
    engine.inject(glider.map((p) => ({ x: p.x + 4, y: p.y + 4 })));
    for (let t = 0; t < 80; t++) {
      engine.step();
      if (t >= 20) expect(liveCells(engine)).toEqual([]);
    }
  });
});
