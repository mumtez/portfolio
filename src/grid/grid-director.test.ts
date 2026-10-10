import { describe, expect, it } from "vitest";
import { GridDirector, TICK_MS, type GridDirectorOptions, type IntroMemory } from "./grid-director";
import { INTRO_SEEDS } from "./intro-seeds";
import { TEST_CONTENT } from "./test-support";

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
    content: TEST_CONTENT,
    ...options,
  });
}

/** Pinned Cells in the viewport, as "x,y" keys. */
function pinnedKeys(d: GridDirector): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < d.engine.height; y++) {
    for (let x = 0; x < d.engine.width; x++) if (d.engine.isPinned(x, y)) out.add(`${x},${y}`);
  }
  return out;
}

/** True when the pinned Cells are exactly the current layout's: on Home, the name and the nav. */
function nameIsPinned(d: GridDirector): boolean {
  const want = new Set(d.layout.pinned.map((p) => `${p.x},${p.y}`));
  for (let y = 0; y < d.engine.height; y++) {
    for (let x = 0; x < d.engine.width; x++) if (d.engine.isPinned(x, y) !== want.has(`${x},${y}`)) return false;
  }
  return true;
}

/** True when nothing but the name is alive in the name's box: the seed formed it exactly. */
function nameFormedExactly(d: GridDirector): boolean {
  const { title: name, pinned } = d.layout;
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
  while (d.phase !== "settled" && ticks < 100) {
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
      const { title: name } = d.layout;
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
      const { title: name } = d.layout;
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
      const { title: name } = d.layout;
      d.input({ x: name.x + 1, y: name.y + 1 });
      expect(d.phase).toBe("settled");
    });

    it("doesn't replay from a click where the name would be on another Section", () => {
      const home = director({ introMemory: memory(true) }).layout.title;
      const d = director({ route: "/about/", introMemory: memory(true) });
      expect(d.canReplayAt({ x: home.x + 1, y: home.y + 1 })).toBe(false);
    });
  });

  describe("a Section loaded directly", () => {
    it.each(TEST_CONTENT.sections.map((s) => s.path).filter((p) => p !== "/"))("shows %s pinned at once", (path) => {
      const d = director({ route: path, introMemory: memory() });
      expect(d.phase).toBe("settled");
      expect(d.route).toBe(path);
      expect(nameIsPinned(d)).toBe(true);
    });

    it("reads a path without its trailing slash as the same Section", () => {
      expect(director({ route: "/projects/baja" }).route).toBe("/projects/baja/");
    });
  });

  describe("a Transition between Sections", () => {
    const settledAt = (route: string) => director({ route, introMemory: memory(true) });

    it("pins the next Section in within the tick budget for about 600ms", () => {
      const d = settledAt("/about/");
      expect(d.navigate("/projects/")).toBe(true);
      expect(d.phase).toBe("transition");
      const ticks = ticksToSettle(d);
      expect(ticks).toBeGreaterThan(0);
      expect(ticks * TICK_MS).toBeLessThanOrEqual(600);
      expect(d.phase).toBe("settled");
      expect(d.route).toBe("/projects/");
      expect(pinnedKeys(d)).toEqual(new Set(settledAt("/projects/").layout.pinned.map((p) => `${p.x},${p.y}`)));
    });

    it("releases the old heading into Free Cells, so real Life tears it apart", () => {
      const d = settledAt("/about/");
      const next = settledAt("/projects/").layout;
      const stays = new Set(next.pinned.map((p) => `${p.x},${p.y}`));
      const released = d.layout.pinned.filter((p) => !stays.has(`${p.x},${p.y}`));
      expect(released.length).toBeGreaterThan(0);

      d.navigate("/projects/");
      for (const p of released) {
        expect(d.engine.isPinned(p.x, p.y)).toBe(false);
        expect(d.engine.isAlive(p.x, p.y)).toBe(true);
      }
    });

    it("pins the next heading in as the Transition runs, not before", () => {
      const d = settledAt("/about/");
      const before = pinnedKeys(d);
      const heading = settledAt("/projects/").layout.title;
      // Cells the two headings share stay pinned throughout; count only the arriving ones.
      const headingPinned = () =>
        [...pinnedKeys(d)].filter((k) => {
          const [x, y] = k.split(",").map(Number);
          const inHeading =
            x >= heading.x && x < heading.x + heading.width && y >= heading.y && y < heading.y + heading.height;
          return inHeading && !before.has(k);
        }).length;

      d.navigate("/projects/");
      expect(headingPinned()).toBe(0);
      d.tick();
      expect(headingPinned()).toBeGreaterThan(0);
    });

    it("keeps the nav pinned, apart from moving the current Section's underline", () => {
      const d = settledAt("/about/");
      const nav = d.layout.nav.filter((i) => !i.current && i.path !== "/projects/");
      d.navigate("/projects/");
      for (const item of nav) {
        const { x, y, width, height } = item.box;
        for (let cy = y; cy < y + height; cy++) {
          for (let cx = x; cx < x + width; cx++) {
            expect(d.engine.isPinned(cx, cy)).toBe(settledAt("/about/").engine.isPinned(cx, cy));
          }
        }
      }
    });

    it("lays out the next Section as soon as the Transition starts", () => {
      const d = settledAt("/about/");
      d.navigate("/projects/baja/");
      expect(d.route).toBe("/projects/baja/");
      expect(d.layout.nav.find((i) => i.current)?.path).toBe("/projects/");
    });

    it("does nothing when asked for the Section already showing", () => {
      const d = settledAt("/about/");
      expect(d.navigate("/about")).toBe(false);
      expect(d.phase).toBe("settled");
    });

    it("can be redirected mid-Transition, and lands on the latest Section", () => {
      const d = settledAt("/about/");
      d.navigate("/projects/");
      d.tick();
      d.navigate("/contact/");
      const ticks = ticksToSettle(d);
      expect(ticks * TICK_MS).toBeLessThanOrEqual(600);
      expect(d.route).toBe("/contact/");
      expect(pinnedKeys(d)).toEqual(new Set(settledAt("/contact/").layout.pinned.map((p) => `${p.x},${p.y}`)));
    });

    it("goes back to Home without replaying the Intro", () => {
      const d = settledAt("/about/");
      d.navigate("/");
      expect(d.phase).toBe("transition");
      ticksToSettle(d);
      expect(d.route).toBe("/");
      expect(nameIsPinned(d)).toBe(true);
    });

    it("skips the Intro first if it's still playing", () => {
      const d = director();
      expect(d.phase).toBe("intro");
      d.navigate("/contact/");
      expect(d.phase).toBe("transition");
      ticksToSettle(d);
      expect(d.route).toBe("/contact/");
      expect(nameIsPinned(d)).toBe(true);
    });
  });
});
