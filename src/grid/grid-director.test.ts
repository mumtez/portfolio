import { describe, expect, it } from "vitest";
import { boxContains, type Box } from "./box";
import {
  BORDER_UNPIN_TICKS,
  GridDirector,
  TICK_MS,
  TRANSITION_TICKS,
  type GridDirectorOptions,
  type IntroMemory,
} from "./grid-director";
import { INTRO_SEEDS } from "./intro-seeds";
import { CellKind } from "./life-engine";
import type { PanelKind, PanelShape, Shape } from "./shapes";
import { mulberry32, rowsIn, TEST_CONTENT } from "./test-support";

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
    for (let x = 0; x < d.engine.width; x++)
      if (d.engine.isPinned(x, y) !== want.has(`${x},${y}`)) return false;
  }
  return true;
}

/** True when nothing but the name is alive in the name's box: the seed formed it exactly. */
function nameFormedExactly(d: GridDirector): boolean {
  const { title: name, pinned } = d.layout;
  const want = new Set(pinned.map((p) => `${p.x},${p.y}`));
  for (let y = name.y; y < name.y + name.height; y++) {
    for (let x = name.x; x < name.x + name.width; x++)
      if (d.engine.isAlive(x, y) !== want.has(`${x},${y}`)) return false;
  }
  return true;
}

function anyPinned(d: GridDirector): boolean {
  for (let y = 0; y < d.engine.height; y++)
    for (let x = 0; x < d.engine.width; x++) if (d.engine.isPinned(x, y)) return true;
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

    it("on a phone-sized viewport, plays a stacked seed and lands exactly on the stacked name", () => {
      const PHONE = { width: 90, height: 160 };
      const { depth, seeds } = INTRO_SEEDS.stacked;
      seeds.forEach((_, i) => {
        const picker = seedPicker();
        picker.pickSeed(i, seeds.length);
        const d = director({ viewport: PHONE, random: picker.random });
        expect(d.layout.nameLayout).toBe("stacked");
        expect(d.phase).toBe("intro");
        expect(ticksToSettle(d)).toBe(depth);
        expect(nameIsPinned(d)).toBe(true);
        expect(nameFormedExactly(d)).toBe(true);
      });
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
        for (let x = 0; x < seed.rows[0].length; x++)
          row += d.engine.isAlive(name.x + seed.dx + x, name.y + seed.dy + y) ? "#" : ".";
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
    it.each(TEST_CONTENT.sections.map((s) => s.path).filter((p) => p !== "/"))(
      "shows %s pinned at once",
      (path) => {
        const d = director({ route: path, introMemory: memory() });
        expect(d.phase).toBe("settled");
        expect(d.route).toBe(path);
        expect(nameIsPinned(d)).toBe(true);
      },
    );

    it("reads a path without its trailing slash as the same Section", () => {
      expect(director({ route: "/projects/baja" }).route).toBe("/projects/baja/");
    });
  });

  describe("a Transition between Sections", () => {
    const settledAt = (route: string) => director({ route, introMemory: memory(true) });

    it("pins the next Section in within the tick budget for about 800ms", () => {
      const d = settledAt("/about/");
      expect(d.navigate("/projects/")).toBe(true);
      expect(d.phase).toBe("transition");
      const ticks = ticksToSettle(d);
      expect(ticks).toBeGreaterThan(0);
      expect(ticks * TICK_MS).toBeLessThanOrEqual(850);
      expect(d.phase).toBe("settled");
      expect(d.route).toBe("/projects/");
      expect(pinnedKeys(d)).toEqual(
        new Set(settledAt("/projects/").layout.pinned.map((p) => `${p.x},${p.y}`)),
      );
    });

    it("releases Home's name into Free Cells, so real Life tears it apart", () => {
      const d = settledAt("/");
      const next = settledAt("/projects/").layout;
      const stays = new Set(next.pinned.map((p) => `${p.x},${p.y}`));
      // Name cells where the next Body Text condenses may stay pinned; the rest go free.
      const released = d.layout.pinned.filter(
        (p) => !stays.has(`${p.x},${p.y}`) && !boxContains(next.body, p),
      );
      expect(released.length).toBeGreaterThan(0);

      d.navigate("/projects/");
      for (const p of released) {
        expect(d.engine.isPinned(p.x, p.y)).toBe(false);
        expect(d.engine.isAlive(p.x, p.y)).toBe(true);
      }
    });

    it("pins Home's name in as the Transition runs, not before", () => {
      const d = settledAt("/about/");
      const before = pinnedKeys(d);
      const heading = settledAt("/").layout.title;
      // Cells already pinned (the nav) stay pinned throughout; count only the arriving ones.
      const headingPinned = () =>
        [...pinnedKeys(d)].filter((k) => {
          const [x, y] = k.split(",").map(Number);
          const inHeading =
            x >= heading.x &&
            x < heading.x + heading.width &&
            y >= heading.y &&
            y < heading.y + heading.height;
          return inHeading && !before.has(k);
        }).length;

      d.navigate("/");
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
      expect(ticks * TICK_MS).toBeLessThanOrEqual(850);
      expect(d.route).toBe("/contact/");
      expect(pinnedKeys(d)).toEqual(
        new Set(settledAt("/contact/").layout.pinned.map((p) => `${p.x},${p.y}`)),
      );
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

  describe("buttons", () => {
    /** Settled on About with no soup, so only the Section's own cells and their Fringe live. */
    const quiet = (options: Partial<GridDirectorOptions> = {}) => {
      const d = director({
        route: "/about/",
        introMemory: memory(true),
        random: () => 0.99,
        ...options,
      });
      for (let t = 0; t < 10; t++) d.tick();
      return d;
    };
    const contact = (d: GridDirector) => d.layout.nav.find((i) => i.path === "/contact/")!;
    const onContact = (d: GridDirector) => ({ x: contact(d).box.x + 3, y: contact(d).box.y + 3 });
    const borderPinned = (d: GridDirector) =>
      contact(d).border.filter((p) => d.engine.isPinned(p.x, p.y)).length;
    /** Live cells in and just around the Contact button, as "x,y" keys. */
    const liveAround = (d: GridDirector) => {
      const { x, y, width, height } = contact(d).box;
      const out: string[] = [];
      for (let cy = y - 2; cy < y + height + 2; cy++) {
        for (let cx = x - 2; cx < x + width + 2; cx++)
          if (d.engine.isAlive(cx, cy)) out.push(`${cx},${cy}`);
      }
      return out;
    };
    const layoutKeys = (d: GridDirector) => new Set(d.layout.pinned.map((p) => `${p.x},${p.y}`));

    it("unpins a button's border when the pointer moves onto it", () => {
      const d = quiet();
      const { border } = contact(d);
      expect(borderPinned(d)).toBe(border.length);
      d.hover(onContact(d));
      expect(borderPinned(d)).toBe(0);
      // Released into Free Cells: still alive until Life gets to them.
      expect(border.every((p) => d.engine.isAlive(p.x, p.y))).toBe(true);
    });

    it("lets the border decay under real Life, then pins it again", () => {
      const d = quiet();
      const still = quiet();
      d.hover(onContact(d));
      d.tick();
      still.tick();
      expect(liveAround(d)).not.toEqual(liveAround(still));
      for (let t = 1; t < BORDER_UNPIN_TICKS - 1; t++) {
        expect(borderPinned(d)).toBe(0);
        d.tick();
      }
      // Just before it pins again, most of the border has died: the decay shows.
      const { border } = contact(d);
      expect(borderPinned(d)).toBe(0);
      expect(border.filter((p) => d.engine.isAlive(p.x, p.y)).length).toBeLessThan(
        border.length / 2,
      );
      d.tick();
      expect(borderPinned(d)).toBe(contact(d).border.length);
      expect(pinnedKeys(d)).toEqual(layoutKeys(d));
    });

    it("plays once per visit: moving within the button doesn't start it over, leaving and coming back does", () => {
      const d = quiet();
      const { box } = contact(d);
      d.hover(onContact(d));
      for (let t = 0; t < BORDER_UNPIN_TICKS; t++) {
        d.hover({ x: box.x + 4 + t, y: box.y + 3 });
        d.tick();
      }
      expect(borderPinned(d)).toBe(contact(d).border.length);

      d.hover({ x: 0, y: d.engine.height - 1 });
      expect(borderPinned(d)).toBe(contact(d).border.length);
      d.hover(onContact(d));
      expect(borderPinned(d)).toBe(0);
    });

    it("unpins only the button under the pointer", () => {
      const d = quiet();
      d.hover(onContact(d));
      for (const item of d.layout.nav.filter((i) => i.path !== "/contact/")) {
        expect(
          item.border.every((p) => d.engine.isPinned(p.x, p.y)),
          item.label,
        ).toBe(true);
      }
    });

    it("does the same when a button gets keyboard focus", () => {
      const d = quiet();
      d.focus("/contact");
      expect(borderPinned(d)).toBe(0);
      for (let t = 0; t < BORDER_UNPIN_TICKS; t++) d.tick();
      expect(pinnedKeys(d)).toEqual(layoutKeys(d));
    });

    it("finds the button under a pointer from the Typesetter's hit regions, border included", () => {
      const d = quiet();
      const { box } = contact(d);
      d.hover({ x: box.x, y: box.y + box.height - 1 });
      expect(borderPinned(d)).toBe(0);
      const e = quiet();
      e.hover({ x: box.x - 1, y: box.y });
      expect(borderPinned(e)).toBe(contact(e).border.length);
    });

    it("leaves the Intro alone: it's strict Life, with nothing pinned to release", () => {
      const d = director();
      const nav = d.layout.nav.find((i) => i.path === "/contact/")!;
      d.hover({ x: nav.box.x + 3, y: nav.box.y + 3 });
      d.focus("/contact/");
      ticksToSettle(d);
      expect(nameIsPinned(d)).toBe(true);
      expect(nameFormedExactly(d)).toBe(true);
    });

    it("never decays under reduced motion", () => {
      const d = quiet({ reducedMotion: true });
      d.hover(onContact(d));
      d.focus("/about/");
      expect(pinnedKeys(d)).toEqual(layoutKeys(d));
    });

    it("keeps decaying through a Transition, and the next Section's buttons end up pinned", () => {
      const d = quiet();
      d.hover(onContact(d));
      d.navigate("/projects/");
      expect(borderPinned(d)).toBe(0);
      ticksToSettle(d);
      for (let t = 0; t < BORDER_UNPIN_TICKS; t++) d.tick();
      expect(pinnedKeys(d)).toEqual(layoutKeys(d));
    });

    describe("the theme and simulation toggles, small icon Buttons", () => {
      const TOGGLES = [
        { id: "theme", icon: "moon", pressed: true },
        { id: "simulation", icon: "glider", pressed: true },
      ] as const;
      const withToggles = () => quiet({ toggles: TOGGLES });
      const theme = (d: GridDirector) => d.layout.toggles.find((t) => t.id === "theme")!;
      const themePinned = (d: GridDirector) =>
        theme(d).border.filter((p) => d.engine.isPinned(p.x, p.y)).length;

      it("pins them with the Section, as Buttons", () => {
        const d = withToggles();
        expect(d.layout.toggles.map((t) => t.id)).toEqual(["theme", "simulation"]);
        expect(pinnedKeys(d)).toEqual(layoutKeys(d));
        expect(themePinned(d)).toBe(theme(d).border.length);
      });

      it("keeps them pinned through a Transition", () => {
        const d = withToggles();
        d.navigate("/projects/");
        expect(themePinned(d)).toBe(theme(d).border.length);
        ticksToSettle(d);
        expect(pinnedKeys(d)).toEqual(layoutKeys(d));
      });

      it("decays a toggle's border on hover, then pins it again", () => {
        const d = withToggles();
        const { box } = theme(d);
        d.hover({ x: box.x + 2, y: box.y + 2 });
        expect(themePinned(d)).toBe(0);
        expect(borderPinned(d)).toBe(contact(d).border.length);
        for (let t = 0; t < BORDER_UNPIN_TICKS; t++) d.tick();
        expect(pinnedKeys(d)).toEqual(layoutKeys(d));
      });

      it("decays a toggle's border on keyboard focus", () => {
        const d = withToggles();
        d.focusToggle("theme");
        expect(themePinned(d)).toBe(0);
        const life = d.layout.toggles.find((t) => t.id === "simulation")!;
        expect(life.border.every((p) => d.engine.isPinned(p.x, p.y))).toBe(true);
      });

      it("redraws a toggle that changes at once, without a Transition", () => {
        const d = withToggles();
        const underlined = (dd: GridDirector) => {
          const { box } = theme(dd);
          const row = box.y + box.height - 3;
          return dd.engine.isPinned(box.x + 2, row);
        };
        expect(underlined(d)).toBe(true);
        d.setToggles([{ ...TOGGLES[0], icon: "sun", pressed: false }, TOGGLES[1]]);
        expect(d.phase).toBe("settled");
        expect(theme(d).pressed).toBe(false);
        expect(theme(d).icon).toBe("sun");
        expect(underlined(d)).toBe(false);
        expect(pinnedKeys(d)).toEqual(layoutKeys(d));
      });

      it("redraws a changed toggle mid-Transition, and still lands on the next Section", () => {
        const d = withToggles();
        d.navigate("/projects/");
        d.tick();
        d.setToggles([{ ...TOGGLES[0], pressed: false }, TOGGLES[1]]);
        ticksToSettle(d);
        expect(d.route).toBe("/projects/");
        expect(theme(d).pressed).toBe(false);
        expect(pinnedKeys(d)).toEqual(layoutKeys(d));
      });

      describe("on a phone held upright, beside CONTACT on the nav's last row", () => {
        // iPhone 390×844 at 3×.
        const PHONE = { width: 90, height: 195, cellPx: 13 / 3 };
        const onPhone = () => quiet({ viewport: PHONE, toggles: TOGGLES });

        it("sits them on CONTACT's row, pinned with the Section", () => {
          const d = onPhone();
          for (const t of d.layout.toggles) {
            expect(t.box.y).toBe(contact(d).box.y);
            expect(t.box.x).toBeGreaterThan(contact(d).box.x + contact(d).box.width);
          }
          expect(pinnedKeys(d)).toEqual(layoutKeys(d));
        });

        it("decays a toggle's border on hover, leaving CONTACT's pinned, then pins it again", () => {
          const d = onPhone();
          const { box } = theme(d);
          d.hover({ x: box.x + 2, y: box.y + 2 });
          expect(themePinned(d)).toBe(0);
          expect(borderPinned(d)).toBe(contact(d).border.length);
          for (let t = 0; t < BORDER_UNPIN_TICKS; t++) d.tick();
          expect(pinnedKeys(d)).toEqual(layoutKeys(d));
        });

        it("decays a toggle's border on keyboard focus", () => {
          const d = onPhone();
          d.focusToggle("theme");
          expect(themePinned(d)).toBe(0);
          expect(borderPinned(d)).toBe(contact(d).border.length);
        });

        it("redraws a pressed toggle in place and keeps it through a Transition", () => {
          const d = onPhone();
          const before = theme(d).box;
          d.setToggles([{ ...TOGGLES[0], icon: "sun", pressed: false }, TOGGLES[1]]);
          expect(theme(d).box).toEqual(before);
          d.navigate("/projects/baja/");
          ticksToSettle(d);
          expect(theme(d).box).toEqual(before);
          expect(pinnedKeys(d)).toEqual(layoutKeys(d));
        });

        it("lets the Intro land exactly on the stacked name below the shorter nav", () => {
          const { depth, seeds } = INTRO_SEEDS.stacked;
          seeds.forEach((_, i) => {
            const picker = seedPicker();
            picker.pickSeed(i, seeds.length);
            const d = director({ viewport: PHONE, toggles: TOGGLES, random: picker.random });
            expect(d.phase).toBe("intro");
            expect(ticksToSettle(d)).toBe(depth);
            expect(nameIsPinned(d)).toBe(true);
            expect(nameFormedExactly(d)).toBe(true);
            const toggleBottom = Math.max(...d.layout.toggles.map((t) => t.box.y + t.box.height));
            expect(d.layout.title.y).toBeGreaterThan(toggleBottom);
          });
        });
      });
    });

    it("starts the Intro clean when it replays mid-decay", () => {
      const d = director({ introMemory: memory(true) });
      const nav = d.layout.nav.find((i) => i.path === "/contact/")!;
      d.hover({ x: nav.box.x + 3, y: nav.box.y + 3 });
      const { title: name } = d.layout;
      d.input({ x: name.x + 1, y: name.y + 1 });
      expect(d.phase).toBe("intro");
      ticksToSettle(d);
      expect(nameIsPinned(d)).toBe(true);
    });
  });

  describe("Body Text shapes in a Transition", () => {
    const settledAt = (route: string) =>
      director({ route, introMemory: memory(true), random: mulberry32(7) });
    /** Three lines of Body Text below the nav, as the page measures them. */
    const LINES: Shape[] = [38, 42, 46].map((y) => ({
      kind: "line",
      box: { x: 57, y, width: 87, height: 4 },
    }));
    /**
     * Cells a line drawn in Cells has at least: a band across its 87-cell width, well
     * above what the ambient soup leaves in a line's box (about 30).
     */
    const INKED = 70;
    const pinnedInLines = (d: GridDirector, lines: readonly Shape[] = LINES) =>
      [...pinnedKeys(d)].filter((k) => {
        const [x, y] = k.split(",").map(Number);
        return lines.some((s) => boxContains(s.box, { x, y }));
      });
    const aliveInLines = (d: GridDirector, lines: readonly Shape[] = LINES) =>
      lines.flatMap(({ box }) => {
        const out: string[] = [];
        for (let y = box.y; y < box.y + box.height; y++)
          for (let x = box.x; x < box.x + box.width; x++)
            if (d.engine.isAlive(x, y)) out.push(`${x},${y}`);
        return out;
      });
    /** Run a Transition to `path` whose HTML lands after `landsAfter` ticks, measuring as `LINES`. */
    function transition(d: GridDirector, path: string, landsAfter = 1): string[] {
      d.navigate(path);
      let condensed: string[] = [];
      for (let t = 0; d.phase === "transition"; t++) {
        if (t === landsAfter) d.setShapes(LINES);
        condensed = pinnedInLines(d);
        d.tick();
      }
      return condensed;
    }

    it("is released at once when a Section loads directly, and stays released as it's measured", () => {
      const d = settledAt("/projects/baja/");
      expect(d.bodyTextReleased).toBe(true);
      d.setShapes(LINES);
      expect(pinnedInLines(d)).toEqual([]);
    });

    it("pins the lines no matter how late the HTML lands, up to the penultimate tick", () => {
      const d = settledAt("/about/");
      const condensed = transition(d, "/projects/", TRANSITION_TICKS - 1);
      expect(condensed.length).toBeGreaterThan(3 * INKED);
    });

    it("settles without lines when the HTML lands later than that; they're just measured", () => {
      const d = settledAt("/about/");
      d.navigate("/projects/");
      ticksToSettle(d);
      d.setShapes(LINES);
      expect(d.bodyTextReleased).toBe(true);
      expect(pinnedInLines(d)).toEqual([]);
    });

    it("condenses the arriving lines out of Cells as the Transition runs, all in by the penultimate tick", () => {
      const d = settledAt("/about/");
      d.navigate("/projects/");
      expect(d.bodyTextReleased).toBe(false);
      d.tick();
      // The arriving Section's HTML has landed: the page measures it.
      d.setShapes(LINES);
      expect(pinnedInLines(d)).toEqual([]);
      const counts: number[] = [];
      let penultimate: number[] = [];
      while (d.phase === "transition") {
        counts.push(pinnedInLines(d).length);
        penultimate = LINES.map((line) => pinnedInLines(d, [line]).length);
        d.tick();
      }
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
      // Every line is inked across its width, like a line of text.
      for (const pinned of penultimate) expect(pinned).toBeGreaterThan(INKED);
    });

    it("releases the lines into Life on the last tick, which is when the HTML fades in", () => {
      const d = settledAt("/about/");
      const condensed = transition(d, "/projects/roborebels/");
      expect(condensed.length).toBeGreaterThan(3 * INKED);
      expect(d.bodyTextReleased).toBe(true);
      expect(pinnedInLines(d)).toEqual([]);
      for (const k of condensed) {
        const [x, y] = k.split(",").map(Number);
        expect(d.engine.isAlive(x, y), k).toBe(true);
      }
      // Real Life tears it apart from there.
      d.tick();
      expect(
        condensed.some((k) => {
          const [x, y] = k.split(",").map(Number);
          return !d.engine.isAlive(x, y);
        }),
      ).toBe(true);
    });

    it("settles within the Transition's budget of about 800ms", () => {
      const d = settledAt("/about/");
      d.navigate("/projects/baja/");
      d.setShapes(LINES);
      expect(ticksToSettle(d) * TICK_MS).toBeLessThanOrEqual(850);
    });

    it("dissolves the outgoing lines on navigate: Free Cells where its text was, for Life to tear apart", () => {
      const d = settledAt("/about/");
      d.setShapes(LINES);
      // Settled, the text is HTML: its lines are only soup.
      for (const line of LINES) expect(aliveInLines(d, [line]).length).toBeLessThan(INKED);
      d.navigate("/projects/");
      for (const line of LINES) expect(aliveInLines(d, [line]).length).toBeGreaterThan(INKED);
      expect(pinnedInLines(d)).toEqual([]);
    });

    it("keeps the latest measure of the outgoing lines, so they dissolve where the text has scrolled to", () => {
      const d = settledAt("/about/");
      d.setShapes(LINES);
      const scrolled: Shape[] = [{ kind: "line", box: { x: 57, y: 52, width: 87, height: 4 } }];
      d.setShapes(scrolled);
      d.navigate("/projects/");
      expect(aliveInLines(d, [LINES[0]]).length).toBeLessThan(INKED);
      expect(aliveInLines(d, scrolled).length).toBeGreaterThan(INKED);
    });

    it("follows the lines when they move mid-Transition", () => {
      const d = settledAt("/about/");
      d.navigate("/projects/");
      d.setShapes(LINES);
      d.tick();
      d.tick();
      const scrolled: Shape[] = LINES.map((s) => ({ ...s, box: { ...s.box, y: s.box.y + 8 } }));
      d.setShapes(scrolled);
      expect(pinnedInLines(d, scrolled).length).toBeGreaterThan(0);
      // The rows the lines left are clear of their pins.
      expect(pinnedInLines(d, [LINES[0]])).toEqual([]);
    });

    it("keeps what has condensed when measured again: only the Cells of what moved change", () => {
      const d = settledAt("/about/");
      d.navigate("/projects/");
      d.setShapes(LINES);
      d.tick();
      d.tick();
      const before = pinnedInLines(d, LINES.slice(0, 2));
      expect(before.length).toBeGreaterThan(0);
      // Measured again (it scrolled a little): the last line moved, a new one came into sight.
      const moved = { ...LINES[2], box: { ...LINES[2].box, y: 50 } };
      const appeared: Shape = { kind: "line", box: { x: 57, y: 30, width: 87, height: 4 } };
      d.setShapes([LINES[0], LINES[1], moved, appeared]);
      expect(pinnedInLines(d, LINES.slice(0, 2))).toEqual(before);
      d.tick();
      // Still condensing from there, never undoing what was in.
      const after = new Set(pinnedInLines(d, LINES.slice(0, 2)));
      for (const k of before) expect(after.has(k), k).toBe(true);
    });

    it("ends on the newer Section when redirected mid-Transition, condensing its lines", () => {
      const d = settledAt("/about/");
      d.navigate("/projects/");
      d.tick();
      d.setShapes(LINES);
      d.tick();
      const half = pinnedInLines(d);
      expect(half.length).toBeGreaterThan(0);
      d.navigate("/contact/");
      expect(d.bodyTextReleased).toBe(false);
      // What had condensed of the abandoned Section is released into Life.
      expect(pinnedInLines(d)).toEqual([]);
      for (const k of half) {
        const [x, y] = k.split(",").map(Number);
        expect(d.engine.isAlive(x, y), k).toBe(true);
      }
      d.tick();
      // The newer Section's HTML lands and condenses in the ticks left.
      d.setShapes(LINES);
      d.tick();
      expect(pinnedInLines(d).length).toBeGreaterThan(0);
      ticksToSettle(d);
      expect(d.route).toBe("/contact/");
      expect(d.bodyTextReleased).toBe(true);
      expect(pinnedKeys(d)).toEqual(
        new Set(settledAt("/contact/").layout.pinned.map((p) => `${p.x},${p.y}`)),
      );
    });
  });

  describe("Panels", () => {
    const settledAt = (route: string) =>
      director({ route, introMemory: memory(true), random: mulberry32(11) });
    const BOX = { x: 60, y: 40, width: 30, height: 12 };
    /** A Panel all in sight: its clip is the viewport. */
    const panel = (kind: PanelKind, box = BOX): PanelShape => ({
      kind: "panel",
      panel: kind,
      box,
      clip: { x: 0, y: 0, ...VIEWPORT },
    });
    /** The Cells on the edge of `box`, as "x,y" keys, going round it. */
    const edge = ({ x, y, width, height }: Box): string[] => {
      const out: string[] = [];
      for (let dx = 0; dx < width; dx++) out.push(`${x + dx},${y}`);
      for (let dy = 1; dy < height; dy++) out.push(`${x + width - 1},${y + dy}`);
      for (let dx = width - 2; dx >= 0; dx--) out.push(`${x + dx},${y + height - 1}`);
      for (let dy = height - 2; dy > 0; dy--) out.push(`${x},${y + dy}`);
      return out;
    };
    const pinnedIn = (d: GridDirector, box: Box) =>
      [...pinnedKeys(d)].filter((k) => {
        const [x, y] = k.split(",").map(Number);
        return boxContains(box, { x, y });
      });
    const interiorOf = ({ x, y, width, height }: Box): Box => ({
      x: x + 1,
      y: y + 1,
      width: width - 2,
      height: height - 2,
    });
    const allWalls = (d: GridDirector, box: Box) => {
      for (let y = box.y; y < box.y + box.height; y++)
        for (let x = box.x; x < box.x + box.width; x++)
          if (d.engine.kindAt(x, y) !== CellKind.Wall) return false;
      return true;
    };
    const noWalls = (d: GridDirector, box: Box) => {
      for (let y = box.y; y < box.y + box.height; y++)
        for (let x = box.x; x < box.x + box.width; x++)
          if (d.engine.kindAt(x, y) === CellKind.Wall) return false;
      return true;
    };

    /** A Frame holding media: its interior is walled, since the media covers it. */
    const media = (box = BOX): PanelShape => ({ ...panel("solid", box), walled: true });

    it("pin a solid Panel's border along its box's edge, keeping Life behind its text", () => {
      const d = settledAt("/experience/");
      d.setShapes([panel("solid")]);
      expect(new Set(pinnedIn(d, BOX))).toEqual(new Set(edge(BOX)));
      expect(noWalls(d, interiorOf(BOX))).toBe(true);
      for (let t = 0; t < 30; t++) d.tick();
      expect(new Set(pinnedIn(d, BOX))).toEqual(new Set(edge(BOX)));
      expect(noWalls(d, interiorOf(BOX))).toBe(true);
    });

    it("pin every other cell of a dashed Panel's border, going round it", () => {
      const d = settledAt("/projects/baja/");
      d.setShapes([panel("dashed")]);
      const round = edge(BOX);
      expect(new Set(pinnedIn(d, BOX))).toEqual(new Set(round.filter((_, i) => i % 2 === 0)));
      expect(noWalls(d, interiorOf(BOX))).toBe(true);
    });

    it("let Cells live inside a text Panel", () => {
      const d = settledAt("/experience/");
      d.setShapes([panel("solid")]);
      const inside = interiorOf(BOX);
      d.engine.inject([{ x: inside.x + 5, y: inside.y + 3 }]);
      expect(d.engine.isAlive(inside.x + 5, inside.y + 3)).toBe(true);
    });

    it("wall off a media Frame's interior: no Cell lives there, whatever flies in", () => {
      const d = settledAt("/projects/baja/");
      d.setShapes([media()]);
      expect(new Set(pinnedIn(d, BOX))).toEqual(new Set(edge(BOX)));
      const inside = interiorOf(BOX);
      for (let t = 0; t < 40; t++) {
        d.tick();
        expect(allWalls(d, inside)).toBe(true);
        for (let y = inside.y; y < inside.y + inside.height; y++)
          for (let x = inside.x; x < inside.x + inside.width; x++)
            expect(d.engine.isAlive(x, y)).toBe(false);
      }
    });

    it("re-pin at their new position when they move, leaving none of the old border or walls", () => {
      const d = settledAt("/experience/");
      d.setShapes([media()]);
      const moved = { ...BOX, y: BOX.y - 5 };
      d.setShapes([media(moved)]);
      expect(new Set(pinnedIn(d, BOX))).toEqual(
        new Set(edge(moved).filter((k) => boxContains(BOX, pointOf(k)))),
      );
      expect(allWalls(d, interiorOf(moved))).toBe(true);
      expect(noWalls(d, { x: BOX.x, y: moved.y + moved.height, width: BOX.width, height: 5 })).toBe(
        true,
      );
    });

    it("draw only the part that shows when scrolled partly out of sight", () => {
      const d = settledAt("/experience/");
      const clip = { x: 0, y: BOX.y + 4, width: VIEWPORT.width, height: 40 };
      d.setShapes([{ ...media(), clip }]);
      const shown = edge(BOX).filter((k) => boxContains(clip, pointOf(k)));
      expect(new Set(pinnedIn(d, BOX))).toEqual(new Set(shown));
      // No border is drawn across the clip's edge.
      expect(d.engine.isPinned(BOX.x + 5, clip.y)).toBe(false);
      expect(noWalls(d, { ...BOX, height: 4 })).toBe(true);
      expect(allWalls(d, { ...interiorOf(BOX), y: clip.y, height: 7 })).toBe(true);
    });

    it("leave the toggles drawn whole when the text scrolls under them", () => {
      const d = settledAt("/experience/");
      d.setToggles([{ id: "theme", icon: "moon", pressed: true }]);
      const toggle = d.layout.toggles[0];
      const under = {
        x: toggle.box.x - 10,
        y: toggle.box.y - 5,
        width: toggle.box.width + 20,
        height: toggle.box.height + 10,
      };
      d.setShapes([panel("solid", under)]);
      for (const p of d.layout.pinned.filter((p) => boxContains(toggle.box, p)))
        expect(d.engine.isPinned(p.x, p.y) && d.engine.isAlive(p.x, p.y), `${p.x},${p.y}`).toBe(
          true,
        );
      for (let y = toggle.box.y; y < toggle.box.y + toggle.box.height; y++)
        for (let x = toggle.box.x; x < toggle.box.x + toggle.box.width; x++)
          expect(d.engine.kindAt(x, y)).not.toBe(CellKind.Wall);
    });

    it("stay pinned when a toggle is pressed", () => {
      const d = settledAt("/experience/");
      d.setShapes([panel("solid")]);
      d.setToggles([{ id: "theme", icon: "sun", pressed: true }]);
      expect(new Set(pinnedIn(d, BOX))).toEqual(new Set(edge(BOX)));
    });

    it("condense their borders in a Transition, all in by the penultimate tick, and keep them pinned after", () => {
      const d = settledAt("/about/");
      d.navigate("/experience/");
      d.tick();
      d.setShapes([media()]);
      const counts: number[] = [];
      let penultimate: string[] = [];
      while (d.phase === "transition") {
        penultimate = pinnedIn(d, BOX);
        counts.push(penultimate.length);
        // While condensing, the interior isn't walled yet: the text condenses there too.
        expect(noWalls(d, interiorOf(BOX))).toBe(true);
        d.tick();
      }
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
      expect(new Set(penultimate)).toEqual(new Set(edge(BOX)));
      expect(new Set(pinnedIn(d, BOX))).toEqual(new Set(edge(BOX)));
      expect(allWalls(d, interiorOf(BOX))).toBe(true);
      for (let t = 0; t < 10; t++) d.tick();
      expect(new Set(pinnedIn(d, BOX))).toEqual(new Set(edge(BOX)));
    });

    it("follow their Panels when they move mid-Transition", () => {
      const d = settledAt("/about/");
      d.navigate("/experience/");
      d.setShapes([panel("solid")]);
      d.tick();
      const moved = { ...BOX, y: BOX.y + 7 };
      d.setShapes([panel("solid", moved)]);
      expect(pinnedIn(d, { ...BOX, height: 7 })).toEqual([]);
      ticksToSettle(d);
      expect(new Set(pinnedIn(d, moved))).toEqual(new Set(edge(moved)));
    });

    it("release their borders into Life and their walls on navigate", () => {
      const d = settledAt("/experience/");
      d.setShapes([media(), panel("dashed", { ...BOX, y: BOX.y + 13, height: 6 })]);
      d.navigate("/about/");
      expect(pinnedIn(d, { ...BOX, height: 19 })).toEqual([]);
      for (const k of edge(BOX)) expect(d.engine.isAlive(...xy(k)), k).toBe(true);
      expect(noWalls(d, BOX)).toBe(true);
      // Real Life tears the border apart from there.
      for (let t = 0; t < 3; t++) d.tick();
      expect(edge(BOX).some((k) => !d.engine.isAlive(...xy(k)))).toBe(true);
    });

    it("let their lines of text dissolve on navigate too, once the walls behind them go", () => {
      const d = settledAt("/experience/");
      const line = { x: BOX.x + 3, y: BOX.y + 3, width: 24, height: 4 };
      d.setShapes([media(), { kind: "line", box: line }]);
      d.navigate("/about/");
      let alive = 0;
      for (let y = line.y; y < line.y + line.height; y++)
        for (let x = line.x; x < line.x + line.width; x++) if (d.engine.isAlive(x, y)) alive++;
      expect(alive).toBeGreaterThan(20);
    });

    it("end with the newer Section's Panels when redirected mid-Transition", () => {
      const d = settledAt("/about/");
      d.navigate("/experience/");
      d.setShapes([panel("solid")]);
      d.tick();
      d.navigate("/projects/baja/");
      expect(pinnedIn(d, BOX)).toEqual([]);
      const frame = { x: 70, y: 36, width: 20, height: 10 };
      d.setShapes([panel("solid", frame)]);
      ticksToSettle(d);
      expect(pinnedIn(d, BOX).filter((k) => !boxContains(frame, pointOf(k)))).toEqual([]);
      expect(new Set(pinnedIn(d, frame))).toEqual(new Set(edge(frame)));
    });

    describe("Button Panels (a Project Entry, a Contact link)", () => {
      const OTHER = { ...BOX, x: BOX.x + 40 };
      const button = (href: string, box = BOX): PanelShape => ({ ...panel("button", box), href });
      const projects = () => {
        const d = settledAt("/projects/");
        d.setShapes([button("/projects/baja/"), button("/projects/roborebels/", OTHER)]);
        return d;
      };
      const inside = (box: Box) => ({ x: box.x + 5, y: box.y + 5 });

      it("release the border of the one under the pointer, leaving the others pinned", () => {
        const d = projects();
        expect(new Set(pinnedIn(d, BOX))).toEqual(new Set(edge(BOX)));
        d.hover(inside(BOX));
        expect(pinnedIn(d, BOX)).toEqual([]);
        for (const k of edge(BOX)) expect(d.engine.isAlive(...xy(k)), k).toBe(true);
        expect(new Set(pinnedIn(d, OTHER))).toEqual(new Set(edge(OTHER)));
        expect(nav(d).every((p) => d.engine.isPinned(p.x, p.y))).toBe(true);
      });

      it("pin it again a few ticks later, even if it scrolled meanwhile", () => {
        const d = projects();
        d.hover(inside(BOX));
        d.tick();
        const moved = { ...BOX, y: BOX.y - 3 };
        d.setShapes([button("/projects/baja/", moved), button("/projects/roborebels/", OTHER)]);
        expect(pinnedIn(d, moved)).toEqual([]);
        for (let t = 2; t < BORDER_UNPIN_TICKS; t++) {
          d.tick();
          expect(pinnedIn(d, moved)).toEqual([]);
        }
        d.tick();
        expect(new Set(pinnedIn(d, moved))).toEqual(new Set(edge(moved)));
      });

      it("hit-test on the part of the box in sight", () => {
        const d = settledAt("/projects/");
        const clip = { x: 0, y: BOX.y + 4, width: VIEWPORT.width, height: 40 };
        d.setShapes([{ ...button("/projects/baja/"), clip }]);
        d.hover({ x: BOX.x + 5, y: BOX.y + 1 });
        expect(pinnedIn(d, BOX).length).toBeGreaterThan(0);
        d.hover({ x: BOX.x + 5, y: clip.y + 1 });
        expect(pinnedIn(d, BOX)).toEqual([]);
      });

      it("release the border of the one with keyboard focus, by its link", () => {
        const d = projects();
        d.focusPanel("/projects/roborebels/");
        expect(pinnedIn(d, OTHER)).toEqual([]);
        expect(new Set(pinnedIn(d, BOX))).toEqual(new Set(edge(BOX)));
        for (let t = 0; t < BORDER_UNPIN_TICKS; t++) d.tick();
        expect(new Set(pinnedIn(d, OTHER))).toEqual(new Set(edge(OTHER)));
      });

      describe("with a Cell label (a Contact link)", () => {
        // EMAIL in the 5×7 font is 29 cells wide: one clear cell and the border round it.
        const LABELLED = { x: 60, y: 40, width: 33, height: 11 };
        // E, M, A, I and L, one clear cell apart.
        const EMAIL = [
          ["#####", "#...#", "..#..", ".###.", "#...."],
          ["#....", "#...#", ".#.#.", "..#..", "#...."],
          ["#....", "##.##", "#...#", "..#..", "#...."],
          ["####.", "#.#.#", "#...#", "..#..", "#...."],
          ["#....", "#...#", "#####", "..#..", "#...."],
          ["#....", "#...#", "#...#", "..#..", "#...."],
          ["#####", "#...#", "#...#", ".###.", "#####"],
        ].map((glyphs) => glyphs.join("."));
        const email = (box = LABELLED): PanelShape => ({
          ...button("mailto:a@b.c", box),
          label: "EMAIL",
        });
        const labelArea = (box: Box) => ({ x: box.x + 2, y: box.y + 2, width: 29, height: 7 });
        /** The Pinned Cells inside the border, as rows of `#` and `.`. */
        const labelIn = (d: GridDirector, box: Box) =>
          rowsIn(pinnedIn(d, interiorOf(box)).map(pointOf), interiorOf(box));

        it("draw the label in Pinned Cells, centred in its border", () => {
          const d = settledAt("/contact/");
          d.setShapes([email()]);
          expect(new Set(pinnedIn(d, LABELLED))).toEqual(
            new Set([...edge(LABELLED), ...pinnedIn(d, labelArea(LABELLED))]),
          );
          expect(labelIn(d, LABELLED)).toEqual(EMAIL);
          for (let t = 0; t < 30; t++) d.tick();
          expect(labelIn(d, LABELLED)).toEqual(EMAIL);
        });

        it("keep the label pinned while the border decays on hover and focus", () => {
          const d = settledAt("/contact/");
          d.setShapes([email()]);
          d.hover(inside(LABELLED));
          expect(new Set(pinnedIn(d, LABELLED))).toEqual(new Set(pinnedIn(d, labelArea(LABELLED))));
          expect(labelIn(d, LABELLED)).toEqual(EMAIL);
          for (let t = 0; t < BORDER_UNPIN_TICKS; t++) d.tick();
          d.focusPanel("mailto:a@b.c");
          expect(labelIn(d, LABELLED)).toEqual(EMAIL);
          expect(pinnedIn(d, LABELLED).some((k) => edge(LABELLED).includes(k))).toBe(false);
        });

        it("condense the label in a Transition and leave it pinned once settled", () => {
          const d = settledAt("/");
          d.navigate("/contact/");
          d.setShapes([email()]);
          while (d.phase === "transition") d.tick();
          expect(labelIn(d, LABELLED)).toEqual(EMAIL);
        });

        it("centre the label in a border snapped a cell wider", () => {
          const d = settledAt("/contact/");
          const wider = { ...LABELLED, width: LABELLED.width + 1 };
          d.setShapes([email(wider)]);
          expect(labelIn(d, wider)).toEqual(EMAIL);
        });
      });

      describe("with a cell icon (a Deep Dive's arrow back to Projects)", () => {
        // The arrow is 7×7: one clear cell and the border round it.
        const ARROWED = { x: 20, y: 30, width: 11, height: 11 };
        const ARROW = ["...#...", "..##...", ".######", "#######", ".######", "..##...", "...#..."];
        const back = (box = ARROWED): PanelShape => ({
          ...button("/projects/", box),
          icon: "arrow-left",
        });
        const iconIn = (d: GridDirector, box: Box) =>
          rowsIn(pinnedIn(d, interiorOf(box)).map(pointOf), interiorOf(box));

        it("draw the icon in Pinned Cells, centred in its pinned border", () => {
          const d = settledAt("/projects/baja/");
          d.setShapes([back()]);
          expect(iconIn(d, ARROWED)).toEqual(ARROW);
          for (const k of edge(ARROWED)) expect(d.engine.isPinned(...xy(k)), k).toBe(true);
        });

        it("decay the border on hover and re-pin it, keeping the icon pinned", () => {
          const d = settledAt("/projects/baja/");
          d.setShapes([back()]);
          d.hover({ x: ARROWED.x + 5, y: ARROWED.y + 5 });
          expect(pinnedIn(d, ARROWED).some((k) => edge(ARROWED).includes(k))).toBe(false);
          expect(iconIn(d, ARROWED)).toEqual(ARROW);
          for (let t = 0; t < BORDER_UNPIN_TICKS; t++) d.tick();
          for (const k of edge(ARROWED)) expect(d.engine.isPinned(...xy(k)), k).toBe(true);
          expect(iconIn(d, ARROWED)).toEqual(ARROW);
        });

        it("decay the border on keyboard focus and re-pin it", () => {
          const d = settledAt("/projects/baja/");
          d.setShapes([back()]);
          d.focusPanel("/projects/");
          expect(pinnedIn(d, ARROWED).some((k) => edge(ARROWED).includes(k))).toBe(false);
          expect(iconIn(d, ARROWED)).toEqual(ARROW);
          for (let t = 0; t < BORDER_UNPIN_TICKS; t++) d.tick();
          for (const k of edge(ARROWED)) expect(d.engine.isPinned(...xy(k)), k).toBe(true);
          expect(iconIn(d, ARROWED)).toEqual(ARROW);
        });
      });

      it("leave solid Panels alone, whatever the pointer does", () => {
        const d = settledAt("/experience/");
        d.setShapes([panel("solid")]);
        d.hover(inside(BOX));
        expect(new Set(pinnedIn(d, BOX))).toEqual(new Set(edge(BOX)));
      });
    });
  });
});

/** Every nav Button's border Cells. */
function nav(d: GridDirector): { x: number; y: number }[] {
  return d.layout.nav.flatMap((i) => i.border);
}

/** An "x,y" key as a point, and as arguments. */
function pointOf(k: string): { x: number; y: number } {
  const [x, y] = k.split(",").map(Number);
  return { x, y };
}
function xy(k: string): [number, number] {
  const { x, y } = pointOf(k);
  return [x, y];
}
