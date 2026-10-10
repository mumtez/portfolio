import { describe, expect, it } from "vitest";
import { nameMask, type Box, type NameLayout } from "./cell-typesetter";
import { INTRO_SEEDS, introCells, SOUP_CLEARANCE } from "./intro-seeds";
import { LifeEngine } from "./life-engine";

/** A small deterministic PRNG (mulberry32), so soup tests are repeatable. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Live cells inside `box` as rows of '#' and '.'. */
function rowsIn(engine: LifeEngine, box: Box): string[] {
  const rows: string[] = [];
  for (let y = box.y; y < box.y + box.height; y++) {
    let row = "";
    for (let x = box.x; x < box.x + box.width; x++) row += engine.isAlive(x, y) ? "#" : ".";
    rows.push(row);
  }
  return rows;
}

const grow = (box: Box, by: number): Box => ({
  x: box.x - by,
  y: box.y - by,
  width: box.width + 2 * by,
  height: box.height + 2 * by,
});

/** A Grid with room for the name, its seed, the clearance and plenty of soup around them. */
function setup(layout: NameLayout) {
  const mask = nameMask(layout);
  const room = INTRO_SEEDS[layout].depth + SOUP_CLEARANCE + 20;
  const engine = new LifeEngine({ width: mask.width + 2 * room, height: mask.height + 2 * room, margin: 4 });
  const name: Box = { x: room, y: room, width: mask.width, height: mask.height };
  const everywhere = grow({ x: 0, y: 0, width: engine.width, height: engine.height }, engine.margin);
  // How the Grid should look once the seed has run: the name and nothing else.
  const onlyName = new LifeEngine({ width: engine.width, height: engine.height, margin: engine.margin });
  onlyName.inject(mask.cells.map((c) => ({ x: c.x + name.x, y: c.y + name.y })));
  return { engine, name, everywhere, expected: (box: Box) => rowsIn(onlyName, box) };
}

describe("Intro Seed pools", () => {
  it("ship 12 one-line seeds of depth 8 and 2 stacked seeds of depth 7", () => {
    expect(INTRO_SEEDS["one-line"].depth).toBe(8);
    expect(INTRO_SEEDS["one-line"].seeds).toHaveLength(12);
    expect(INTRO_SEEDS.stacked.depth).toBe(7);
    expect(INTRO_SEEDS.stacked.seeds).toHaveLength(2);
  });

  for (const layout of ["one-line", "stacked"] as const) {
    const { depth, seeds } = INTRO_SEEDS[layout];

    describe(`${layout} (depth ${depth})`, () => {
      seeds.forEach((seed, i) => {
        it(`seed ${i + 1} becomes exactly the name after ${depth} strict generations`, () => {
          const { engine, name, everywhere, expected } = setup(layout);
          engine.inject(introCells(seed, name));
          for (let t = 0; t < depth; t++) engine.step();
          expect(rowsIn(engine, everywhere)).toEqual(expected(everywhere));
        });

        it(`seed ${i + 1} still becomes exactly the name with soup ${SOUP_CLEARANCE} cells outside its box`, () => {
          for (const [density, s] of [[0.38, 1], [0.5, 2], [1, 3]] as const) {
            const { engine, name, everywhere, expected } = setup(layout);
            engine.inject(introCells(seed, name, { area: everywhere, density, random: rng(s * 100 + i) }));
            for (let t = 0; t < depth; t++) engine.step();
            // The name with nothing touching it; the soup is still churning further out.
            const nameAndBorder = grow(name, 1);
            expect(rowsIn(engine, nameAndBorder)).toEqual(expected(nameAndBorder));
          }
        });
      });
    });
  }

  it(`keeps soup exactly ${SOUP_CLEARANCE} cells clear of the seed's box and fills right up to that`, () => {
    const { name, everywhere } = setup("one-line");
    const seed = INTRO_SEEDS["one-line"].seeds[0];
    const cells = new Set(
      introCells(seed, name, { area: everywhere, density: 1, random: Math.random }).map((p) => `${p.x},${p.y}`),
    );
    const seedBox: Box = { x: name.x + seed.dx, y: name.y + seed.dy, width: seed.rows[0].length, height: seed.rows.length };
    const ring = (by: number) => {
      const outer = grow(seedBox, by);
      const out: string[] = [];
      for (let x = outer.x; x < outer.x + outer.width; x++) out.push(`${x},${outer.y}`, `${x},${outer.y + outer.height - 1}`);
      for (let y = outer.y; y < outer.y + outer.height; y++) out.push(`${outer.x},${y}`, `${outer.x + outer.width - 1},${y}`);
      return out;
    };
    for (let by = 1; by <= SOUP_CLEARANCE; by++) expect(ring(by).filter((k) => cells.has(k))).toEqual([]);
    expect(ring(SOUP_CLEARANCE + 1).every((k) => cells.has(k))).toBe(true);
  });
});
