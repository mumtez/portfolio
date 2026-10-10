import { describe, expect, it } from "vitest";
import { CellKind, LifeEngine, type Point } from "./life-engine";
import { HEADINGS, spaceship, type SpaceshipKind } from "./spaceships";
import { allLive, inViewport, mulberry32, soup } from "./test-support";

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

  describe("walls (Frames)", () => {
    /** Every Cell in a box, as Points. */
    const boxCells = (x0: number, y0: number, w: number, h: number): Point[] =>
      Array.from({ length: w * h }, (_, i) => ({ x: x0 + (i % w), y: y0 + Math.floor(i / w) }));

    it("kill any Cell inside them and leave no ghost there", () => {
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      const block = BLOCK.map((p) => ({ x: p.x + 4, y: p.y + 4 }));
      engine.inject(block);
      engine.setWalls(boxCells(3, 3, 4, 4));
      for (const p of block) {
        expect(engine.isAlive(p.x, p.y)).toBe(false);
        expect(engine.kindAt(p.x, p.y)).toBe(CellKind.Wall);
      }
    });

    it("never come alive, even with three live neighbours", () => {
      // The middle of a blinker's neighbourhood is a wall: the blinker can't turn.
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      engine.setWalls([{ x: 4, y: 3 }, { x: 4, y: 5 }]);
      engine.inject([{ x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }]);
      engine.step();
      expect(engine.isAlive(4, 3)).toBe(false);
      expect(engine.isAlive(4, 5)).toBe(false);
    });

    it("count as dead neighbours", () => {
      // A block with one Cell inside a wall is three Cells: an L that grows back
      // into a block only if the walled Cell counted. With the wall it can't.
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      engine.inject(BLOCK.map((p) => ({ x: p.x + 4, y: p.y + 4 })));
      engine.setWalls([{ x: 5, y: 5 }]);
      engine.step();
      expect(engine.isAlive(5, 5)).toBe(false);
      expect(liveCells(engine)).toEqual(["4,4", "4,5", "5,4"]);
    });

    it("ignore Free Cells injected into them", () => {
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      engine.setWalls([{ x: 5, y: 5 }]);
      engine.inject([{ x: 5, y: 5 }]);
      expect(engine.isAlive(5, 5)).toBe(false);
    });

    it("win over pins: a Pinned Cell inside a wall is dead until the wall goes", () => {
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      engine.setWalls([{ x: 5, y: 5 }]);
      engine.setPinned([{ x: 5, y: 5 }]);
      engine.step();
      expect(engine.isAlive(5, 5)).toBe(false);
      expect(engine.isPinned(5, 5)).toBe(false);
      engine.setWalls([]);
      engine.step();
      expect(engine.isPinned(5, 5)).toBe(true);
      expect(engine.isAlive(5, 5)).toBe(true);
    });

    it("are replaced, not accumulated, by a new set of walls", () => {
      const engine = new LifeEngine({ width: 10, height: 10, margin: 2 });
      engine.setWalls([{ x: 2, y: 2 }]);
      engine.setWalls([{ x: 7, y: 7 }]);
      expect(engine.kindAt(2, 2)).toBe(CellKind.Dead);
      expect(engine.kindAt(7, 7)).toBe(CellKind.Wall);
      engine.inject([{ x: 2, y: 2 }]);
      expect(engine.isAlive(2, 2)).toBe(true);
    });

    it.each([0, 1, 2, 3])("stay dead and absorb a glider that hits them (phase %i)", (phase) => {
      // A glider flying down-right into a wall 10 cells thick: nothing ever lives in
      // the wall, nothing gets past it, and what's left stops moving.
      const engine = new LifeEngine({ width: 40, height: 40, margin: 4 });
      const wall = boxCells(20, 0, 10, 40);
      engine.setWalls(wall);
      const ship = spaceship("glider", { x: 1, y: 1 });
      engine.inject(ship.cells.map((p) => ({ x: p.x + 4 + phase, y: p.y + 10 })));
      const walled = new Set(wall.map((p) => `${p.x},${p.y}`));
      for (let t = 0; t < 120; t++) {
        engine.step();
        for (const p of allLive(engine)) {
          expect(walled.has(`${p.x},${p.y}`)).toBe(false);
          expect(p.x).toBeLessThan(20);
        }
      }
      const before = liveCells(engine);
      engine.step();
      engine.step();
      expect(liveCells(engine)).toEqual(before);
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

    it.each([1, 2, 3, 4, 5, 6])("leaves no residue in the margin after 5 minutes of soup (seed %i)", (seed) => {
      const engine = new LifeEngine({ width: 150, height: 85, margin: 12 });
      engine.inject(soup(engine, 0.09, mulberry32(seed)));
      const residue = new Set<string>();
      for (let t = 0; t < 2500; t++) {
        engine.step();
        if (t < 2400) continue;
        for (const p of allLive(engine)) if (!inViewport(engine, p)) residue.add(`${p.x},${p.y}`);
      }
      expect([...residue]).toEqual([]);
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
