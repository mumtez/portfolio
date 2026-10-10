import { describe, expect, it } from "vitest";
import { GridDirector, TICK_MS, type GridDirectorOptions, type IntroMemory } from "./grid-director";
import { INTRO_SEEDS } from "./intro-seeds";

const VIEWPORT = { width: 201, height: 60 };

/** Session memory that starts unseen (or seen) and records being marked. */
function memory(seen = false): IntroMemory & { marked: boolean } {
  return {
    marked: false,
    hasSeen: () => seen,
    markSeen() {
      this.marked = true;
      seen = true;
    },
  };
}

function director(options: Partial<GridDirectorOptions> = {}) {
  return new GridDirector({
    viewport: VIEWPORT,
    margin: 12,
    route: "/",
    reducedMotion: false,
    introMemory: memory(),
    ...options,
  });
}

/** True when the pinned Cells are exactly the name's. */
function nameIsPinned(d: GridDirector): boolean {
  const want = new Set(d.home.pinned.map((p) => `${p.x},${p.y}`));
  for (let y = 0; y < d.engine.height; y++) {
    for (let x = 0; x < d.engine.width; x++) if (d.engine.isPinned(x, y) !== want.has(`${x},${y}`)) return false;
  }
  return true;
}

/** True when nothing but the name is alive in the name's box: the seed formed it exactly. */
function nameFormedExactly(d: GridDirector): boolean {
  const { name, pinned } = d.home;
  const want = new Set(pinned.map((p) => `${p.x},${p.y}`));
  for (let y = name.y; y < name.y + name.height; y++) {
    for (let x = name.x; x < name.x + name.width; x++) if (d.engine.isAlive(x, y) !== want.has(`${x},${y}`)) return false;
  }
  return true;
}

function anyPinned(d: GridDirector): boolean {
  for (let y = 0; y < d.engine.height; y++) for (let x = 0; x < d.engine.width; x++) if (d.engine.isPinned(x, y)) return true;
  return false;
}

/** Ticks until the Director settles (capped, so a broken Intro fails instead of hanging). */
function ticksToSettle(d: GridDirector): number {
  let ticks = 0;
  while (d.phase === "intro" && ticks < 100) {
    d.tick();
    ticks++;
  }
  return ticks;
}

/** A random source whose next value can be set, to choose which seed the Intro picks. */
function seedPicker() {
  let next: number | undefined;
  return {
    pickSeed(index: number, poolSize: number) {
      next = (index + 0.5) / poolSize;
    },
    random(): number {
      const value = next ?? Math.random();
      next = undefined;
      return value;
    },
  };
}

describe("Grid Director", () => {
  describe("the Intro on a first visit to Home", () => {
    it("runs strict Life, with nothing pinned, until the name forms", () => {
      const d = director();
      expect(d.phase).toBe("intro");
      for (let t = 0; t < INTRO_SEEDS["one-line"].depth - 1; t++) {
        expect(anyPinned(d)).toBe(false);
        d.tick();
      }
      expect(d.phase).toBe("intro");
      expect(anyPinned(d)).toBe(false);
    });

    it("pins the name after the seed's depth in ticks, readable within about 1.5s", () => {
      const d = director();
      const ticks = ticksToSettle(d);
      expect(ticks).toBe(INTRO_SEEDS["one-line"].depth);
      expect(ticks * TICK_MS).toBeLessThanOrEqual(1500);
      expect(d.phase).toBe("settled");
      expect(nameIsPinned(d)).toBe(true);
      expect(nameFormedExactly(d)).toBe(true);
    });

    it("lands on the name from every seed in the pool", () => {
      const { seeds } = INTRO_SEEDS["one-line"];
      seeds.forEach((_, i) => {
        const picker = seedPicker();
        picker.pickSeed(i, seeds.length);
        const d = director({ random: picker.random });
        ticksToSettle(d);
        expect(nameIsPinned(d)).toBe(true);
        expect(nameFormedExactly(d)).toBe(true);
      });
    });

    it("surrounds the seed with soup, so the whole screen starts in chaos", () => {
      const d = director();
      const { name } = d.home;
      let farAlive = 0;
      for (let y = 0; y < d.engine.height; y++) {
        for (let x = 0; x < name.x - 20; x++) if (d.engine.isAlive(x, y)) farAlive++;
      }
      expect(farAlive).toBeGreaterThan(0);
    });

    it("remembers that the Intro has been seen this session", () => {
      const introMemory = memory();
      director({ introMemory });
      expect(introMemory.marked).toBe(true);
    });
  });

  describe("skipping", () => {
    it("lands straight on the pinned name on any input during the Intro", () => {
      const d = director();
      d.tick();
      d.tick();
      d.input();
      expect(d.phase).toBe("settled");
      expect(nameIsPinned(d)).toBe(true);
      expect(nameFormedExactly(d)).toBe(true);
    });

    it("lands on the name wherever the input is", () => {
      const d = director();
      d.input({ x: 0, y: 0 });
      expect(d.phase).toBe("settled");
      expect(nameIsPinned(d)).toBe(true);
    });
  });

  describe("when the Intro doesn't play", () => {
    for (const [why, options] of [
      ["on a deep link", { route: "/projects/baja" }],
      ["under reduced motion", { reducedMotion: true }],
      ["on a second load in the same session", { introMemory: memory(true) }],
    ] as const) {
      it(`shows the pinned name at once ${why}`, () => {
        const d = director(options);
        expect(d.phase).toBe("settled");
        expect(nameIsPinned(d)).toBe(true);
      });
    }

    it("doesn't count a deep link as having seen the Intro", () => {
      const introMemory = memory();
      director({ route: "/projects/baja", introMemory });
      expect(introMemory.marked).toBe(false);
    });

    it("treats /index.html as Home", () => {
      expect(director({ route: "/index.html" }).phase).toBe("intro");
    });
  });

  describe("replaying", () => {
    it("replays the Intro when the name is clicked, with a randomly chosen seed", () => {
      const { seeds } = INTRO_SEEDS["one-line"];
      const picker = seedPicker();
      const d = director({ introMemory: memory(true), random: picker.random });
      const { name } = d.home;
      picker.pickSeed(3, seeds.length);
      d.input({ x: name.x + 1, y: name.y + 1 });
      expect(d.phase).toBe("intro");
      expect(anyPinned(d)).toBe(false);

      const seed = seeds[3];
      const rows: string[] = [];
      for (let y = 0; y < seed.rows.length; y++) {
        let row = "";
        for (let x = 0; x < seed.rows[0].length; x++) row += d.engine.isAlive(name.x + seed.dx + x, name.y + seed.dy + y) ? "#" : ".";
        rows.push(row);
      }
      expect(rows).toEqual(seed.rows);

      ticksToSettle(d);
      expect(nameIsPinned(d)).toBe(true);
      expect(nameFormedExactly(d)).toBe(true);
    });

    it("ignores clicks away from the name once settled", () => {
      const d = director({ introMemory: memory(true) });
      d.input({ x: 0, y: 0 });
      d.input();
      expect(d.phase).toBe("settled");
    });

    it("never replays under reduced motion", () => {
      const d = director({ reducedMotion: true });
      const { name } = d.home;
      d.input({ x: name.x + 1, y: name.y + 1 });
      expect(d.phase).toBe("settled");
    });
  });
});
