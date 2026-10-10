import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import prototypeLayouts from "../../tests/fixtures/prototype-name-layouts.json";
import {
  BODY_TEXT_CSS,
  bodyTextCondensate,
  boxContains,
  nameMask,
  navItemAt,
  textMask,
  typesetSection,
  type Box,
  type CellMask,
} from "./cell-typesetter";
import type { Point } from "./life-engine";
import { boxesOverlap, boxInside, mulberry32, rowsIn, TEST_CONTENT } from "./test-support";

const VIEWPORT = { width: 201, height: 60 };

/** Render a mask as rows of '#' (pinned) and '.' (empty), the prototype's format. */
function toRows(mask: CellMask): string[] {
  const rows = Array.from({ length: mask.height }, () => Array<string>(mask.width).fill("."));
  for (const { x, y } of mask.cells) rows[y][x] = "#";
  return rows.map((r) => r.join(""));
}

/** A mask's rows trimmed to its live cells, to compare with `rowsIn`. */
function trimmed(mask: CellMask): string[] {
  return rowsIn(mask.cells, { x: 0, y: 0, width: mask.width, height: mask.height });
}

const key = (p: Point) => `${p.x},${p.y}`;

/** `box` shrunk by `by` cells on every side. */
function inside(box: Box, by: number): Box {
  return { x: box.x + by, y: box.y + by, width: box.width - 2 * by, height: box.height - 2 * by };
}

describe("Cell Typesetter", () => {
  it("lays out the one-line name exactly as the prototype did (135×9)", () => {
    const mask = nameMask("one-line");
    expect(mask.width).toBe(135);
    expect(mask.height).toBe(9);
    expect(toRows(mask)).toEqual(prototypeLayouts["one-line"]);
  });

  it("lays out the stacked name exactly as the prototype did (78×22)", () => {
    const mask = nameMask("stacked");
    expect(mask.width).toBe(78);
    expect(mask.height).toBe(22);
    expect(toRows(mask)).toEqual(prototypeLayouts["two-lines"]);
  });

  describe("text in the 5×7 font", () => {
    it("sets each glyph 5 cells wide with a 1-cell gap, 8 rows tall", () => {
      expect(toRows(textMask("HI-"))).toEqual([
        "#...#..###.......",
        "#...#...#........",
        "#...#...#........",
        "#####...#...#####",
        "#...#...#........",
        "#...#...#........",
        "#...#..###.......",
        ".................",
      ]);
    });

    it("sets lowercase in capitals", () => {
      expect(textMask("Home")).toEqual(textMask("HOME"));
    });

    it("leaves a glyph-wide gap for a space", () => {
      const mask = textMask("H H");
      expect(mask.width).toBe(17);
      expect(toRows(mask)[3]).toBe("#####.......#####");
    });
  });

  describe("the nav, on every Section", () => {
    const NAV = [
      ["/", "Home"],
      ["/about/", "About"],
      ["/experience/", "Experience"],
      ["/projects/", "Projects"],
      ["/contact/", "Contact"],
    ];

    it.each(TEST_CONTENT.sections.map((s) => s.path))("lists the top-level Sections in order on %s", (path) => {
      const layout = typesetSection(VIEWPORT, TEST_CONTENT, path);
      expect(layout.nav.map((item) => [item.path, item.label])).toEqual(NAV);
    });

    it("draws each label in Pinned Cells inside its border", () => {
      const layout = typesetSection(VIEWPORT, TEST_CONTENT, "/about/");
      for (const item of layout.nav.filter((i) => !i.current)) {
        expect(rowsIn(layout.pinned, inside(item.box, 1))).toEqual(trimmed(textMask(item.label)));
      }
    });

    it("draws each item as a button: a pinned border around its hit region, clear of the label", () => {
      const layout = typesetSection(VIEWPORT, TEST_CONTENT, "/about/");
      const pinned = new Set(layout.pinned.map(key));
      for (const item of layout.nav) {
        const { x, y, width, height } = item.box;
        const edge = new Set<string>();
        for (let cx = x; cx < x + width; cx++) edge.add(`${cx},${y}`).add(`${cx},${y + height - 1}`);
        for (let cy = y; cy < y + height; cy++) edge.add(`${x},${cy}`).add(`${x + width - 1},${cy}`);
        expect(new Set(item.border.map(key)), item.label).toEqual(edge);
        for (const k of edge) expect(pinned.has(k), `${item.label} ${k}`).toBe(true);
        // One clear cell between the border and the label (and underline) on every side.
        const gap = layout.pinned.filter(
          (p) => boxContains(inside(item.box, 1), p) && !boxContains(inside(item.box, 2), p),
        );
        expect(gap, item.label).toEqual([]);
      }
    });

    it("underlines the current Section's label", () => {
      const layout = typesetSection(VIEWPORT, TEST_CONTENT, "/about/");
      const about = layout.nav.find((i) => i.current);
      expect(about?.path).toBe("/about/");
      const rows = rowsIn(layout.pinned, inside(about!.box, 1));
      const label = trimmed(textMask("About"));
      expect(rows.slice(0, label.length)).toEqual(label);
      expect(rows.at(-1)).toBe("#".repeat(textMask("About").width));
    });

    it("marks Projects as current on a Deep Dive", () => {
      const layout = typesetSection(VIEWPORT, TEST_CONTENT, "/projects/baja/");
      expect(layout.nav.filter((i) => i.current).map((i) => i.path)).toEqual(["/projects/"]);
    });

    it("marks only Home as current on Home", () => {
      const layout = typesetSection(VIEWPORT, TEST_CONTENT, "/");
      expect(layout.nav.filter((i) => i.current).map((i) => i.path)).toEqual(["/"]);
    });

    it.each([150, 180, 260])("keeps every item inside a %i-cell-wide viewport, without overlaps", (width) => {
      const viewport = { width, height: 100 };
      const { nav } = typesetSection(viewport, TEST_CONTENT, "/contact/");
      for (const item of nav) expect(boxInside(item.box, viewport), item.label).toBe(true);
      nav.forEach((a, i) => nav.slice(i + 1).forEach((b) => expect(boxesOverlap(a.box, b.box)).toBe(false)));
    });

    it("fits on one line when the viewport is wide, and wraps when it isn't", () => {
      const rowsUsed = (width: number) =>
        new Set(typesetSection({ width, height: 100 }, TEST_CONTENT, "/").nav.map((i) => i.box.y)).size;
      expect(rowsUsed(260)).toBe(1);
      expect(rowsUsed(150)).toBeGreaterThan(1);
    });

    describe("on a narrow viewport (a phone held upright)", () => {
      const PHONE = { width: 90, height: 190 };

      it("stacks into a single column, one item per row, in order", () => {
        const { nav } = typesetSection(PHONE, TEST_CONTENT, "/about/");
        expect(nav.map((i) => i.path)).toEqual(NAV.map(([path]) => path));
        const ys = nav.map((i) => i.box.y);
        expect([...ys].sort((a, b) => a - b)).toEqual(ys);
        expect(new Set(ys).size).toBe(nav.length);
        for (const item of nav) expect(boxInside(item.box, PHONE), item.label).toBe(true);
        nav.forEach((a, i) => nav.slice(i + 1).forEach((b) => expect(boxesOverlap(a.box, b.box)).toBe(false)));
      });

      it("centres each item and draws its label inside its hit region", () => {
        const layout = typesetSection(PHONE, TEST_CONTENT, "/about/");
        for (const item of layout.nav) {
          expect(Math.abs(item.box.x + item.box.width / 2 - PHONE.width / 2), item.label).toBeLessThanOrEqual(1);
          const label = trimmed(textMask(item.label));
          expect(rowsIn(layout.pinned, inside(item.box, 1)).slice(0, label.length), item.label).toEqual(label);
        }
      });

      it("maps a tap on each row to that row's item", () => {
        const layout = typesetSection(PHONE, TEST_CONTENT, "/");
        for (const item of layout.nav) {
          const middle = { x: item.box.x + Math.floor(item.box.width / 2), y: item.box.y + Math.floor(item.box.height / 2) };
          expect(navItemAt(layout, middle)?.path).toBe(item.path);
        }
        // Beside a short label, in the column's row, is not a link.
        const home = layout.nav[0];
        expect(navItemAt(layout, { x: home.box.x - 1, y: home.box.y + 2 })).toBeUndefined();
      });

      it("is the same nav on every Section, so a Transition leaves it pinned", () => {
        const boxes = (path: string) => typesetSection(PHONE, TEST_CONTENT, path).nav.map((i) => i.box);
        for (const { path } of TEST_CONTENT.sections) expect(boxes(path)).toEqual(boxes("/"));
      });

      it("wraps into rows instead when a column would push the stacked name off a short viewport", () => {
        const landscape = { width: 140, height: 65 };
        const home = typesetSection(landscape, TEST_CONTENT, "/");
        expect(home.nameLayout).toBe("stacked");
        expect(new Set(home.nav.map((i) => i.box.y)).size).toBeLessThan(home.nav.length);
        expect(boxInside(home.title, landscape)).toBe(true);
      });
    });

    it("maps a cell to the nav item whose hit region holds it", () => {
      const layout = typesetSection(VIEWPORT, TEST_CONTENT, "/");
      const projects = layout.nav[3];
      expect(navItemAt(layout, { x: projects.box.x + 2, y: projects.box.y + 2 })?.path).toBe("/projects/");
      expect(navItemAt(layout, { x: 0, y: VIEWPORT.height - 1 })).toBeUndefined();
    });
  });

  describe("a Section's heading", () => {
    it("is drawn in Pinned Cells below the nav, centred", () => {
      const layout = typesetSection(VIEWPORT, TEST_CONTENT, "/experience/");
      const { title } = layout;
      expect(rowsIn(layout.pinned, title)).toEqual(trimmed(textMask("Experience")));
      expect(Math.abs(title.x + title.width / 2 - VIEWPORT.width / 2)).toBeLessThanOrEqual(1);
      for (const item of layout.nav) expect(title.y).toBeGreaterThan(item.box.y + item.box.height);
    });

    it("pins nothing but the heading and the nav", () => {
      const layout = typesetSection(VIEWPORT, TEST_CONTENT, "/experience/");
      const regions = [layout.title, ...layout.nav.map((i) => i.box)];
      for (const cell of layout.pinned) expect(regions.some((r) => boxContains(r, cell))).toBe(true);
    });

    it("wraps a long heading onto more lines inside the viewport", () => {
      const viewport = { width: 120, height: 100 };
      const layout = typesetSection(viewport, TEST_CONTENT, "/projects/baja/");
      expect(boxInside(layout.title, viewport)).toBe(true);
      expect(layout.title.height).toBeGreaterThan(textMask("X").height);
      const cells = layout.pinned.filter((c) => boxContains(layout.title, c));
      expect(cells.length).toBe(textMask("Bajafuel-levelestimator").cells.length);
    });

    it("has no heading at a path the Grid doesn't know, only the nav", () => {
      const layout = typesetSection(VIEWPORT, TEST_CONTENT, "/nowhere/");
      expect(layout.title.height).toBe(0);
      expect(layout.nav.some((i) => i.current)).toBe(false);
    });
  });

  describe("Home", () => {
    it("centres the one-line name horizontally and pins exactly its cells, plus the nav", () => {
      const home = typesetSection(VIEWPORT, TEST_CONTENT, "/");
      expect(home.nameLayout).toBe("one-line");
      expect(home.title).toMatchObject({ x: 33, width: 135, height: 9 });
      expect(rowsIn(home.pinned, home.title)).toEqual(trimmed(nameMask("one-line")));
      const regions = [home.title, ...home.nav.map((i) => i.box)];
      for (const cell of home.pinned) expect(regions.some((r) => boxContains(r, cell))).toBe(true);
    });

    it("places the name below the nav and above the middle of the viewport", () => {
      const viewport = { width: 180, height: 113 };
      const home = typesetSection(viewport, TEST_CONTENT, "/");
      for (const item of home.nav) expect(home.title.y).toBeGreaterThan(item.box.y + item.box.height);
      expect(home.title.y + home.title.height).toBeLessThanOrEqual(viewport.height / 2);
    });

    it("keeps the one-line name while it fits with 3 cells clear at each side (141 cells)", () => {
      expect(typesetSection({ width: 141, height: 100 }, TEST_CONTENT, "/").nameLayout).toBe("one-line");
    });

    it.each([140, 100, 90, 84])("stacks the name when the one-line name doesn't fit (%i cells wide)", (width) => {
      const viewport = { width, height: 150 };
      const home = typesetSection(viewport, TEST_CONTENT, "/");
      expect(home.nameLayout).toBe("stacked");
      expect(home.title).toMatchObject({ width: 78, height: 22 });
      expect(boxInside(home.title, viewport)).toBe(true);
      expect(Math.abs(home.title.x + home.title.width / 2 - width / 2)).toBeLessThanOrEqual(1);
      expect(rowsIn(home.pinned, home.title)).toEqual(trimmed(nameMask("stacked")));
      for (const item of home.nav) expect(home.title.y).toBeGreaterThan(item.box.y + item.box.height);
    });

    it("has no name layout on other Sections", () => {
      expect(typesetSection(VIEWPORT, TEST_CONTENT, "/about/").nameLayout).toBeUndefined();
    });
  });

  describe("the Body Text region", () => {
    it("is laid out from the same measurements as the page CSS", () => {
      const css = (file: string) => readFileSync(new URL(`../layouts/${file}`, import.meta.url), "utf8");
      const { gapRem, columnRem, gutterPx, lineHeight } = BODY_TEXT_CSS;
      expect(css("Base.astro")).toContain(`top: calc(var(--below-title, 45vh) + ${gapRem}rem)`);
      expect(css("Section.astro")).toContain(`padding: 0 max(${gutterPx}px, calc((100% - ${columnRem}rem) / 2)) 64px`);
      expect(css("Section.astro")).toContain(`line-height: ${lineHeight};`);
    });

    it.each(TEST_CONTENT.sections.map((s) => s.path))("on %s sits below the title, clear of every Pinned Cell, down to the bottom", (path) => {
      const layout = typesetSection(VIEWPORT, TEST_CONTENT, path);
      const { body, title } = layout;
      expect(body.y).toBeGreaterThan(title.y + title.height);
      expect(body.y + body.height).toBe(VIEWPORT.height);
      expect(boxInside(body, VIEWPORT)).toBe(true);
      for (const cell of layout.pinned) expect(boxContains(body, cell)).toBe(false);
    });

    it("is a centred column about 44rem (704px) wide on a wide screen", () => {
      // 8px cells: 704px is 88 cells.
      const { body } = typesetSection({ width: 240, height: 110, cellPx: 8 }, TEST_CONTENT, "/about/");
      expect(body.width).toBe(88);
      expect(body.x).toBe(76);
    });

    it("spans the screen less a 16px gutter on each side on a phone", () => {
      // A 390px phone at 2px cells: 195 cells, gutters of 8 cells.
      const { body } = typesetSection({ width: 195, height: 422, cellPx: 2 }, TEST_CONTENT, "/projects/baja/");
      expect(body.x).toBe(8);
      expect(body.width).toBe(179);
    });

    it("is empty when the title leaves no room below it", () => {
      const { body } = typesetSection({ width: 201, height: 20 }, TEST_CONTENT, "/about/");
      expect(body.height).toBe(0);
    });
  });

  describe("the Body Text condensate", () => {
    const viewport = { width: 240, height: 110, cellPx: 8 };
    const { body } = typesetSection(viewport, TEST_CONTENT, "/projects/roborebels/");
    const cells = bodyTextCondensate(body, viewport, mulberry32(1));

    it("lies inside the Body Text region", () => {
      expect(cells.length).toBeGreaterThan(0);
      for (const cell of cells) expect(boxContains(body, cell)).toBe(true);
    });

    it("looks like lines of text: bands of rows with blank rows between them", () => {
      // 8px cells and ~25px lines: a 3-row pitch, 2 rows of text and 1 blank.
      const rows = new Set(cells.map((c) => c.y - body.y));
      expect(rows.has(0)).toBe(true);
      expect(rows.has(1)).toBe(true);
      expect(rows.has(2)).toBe(false);
      expect(rows.has(3)).toBe(true);
      expect(rows.has(5)).toBe(false);
    });

    it("starts each line at the column's left edge, ragged on the right", () => {
      const lines = Map.groupBy(cells, (c) => Math.floor((c.y - body.y) / 3));
      const rights = [...lines.values()].map((line) => Math.max(...line.map((c) => c.x)));
      for (const line of lines.values()) expect(Math.min(...line.map((c) => c.x))).toBeLessThan(body.x + 4);
      expect(new Set(rights).size).toBeGreaterThan(1);
    });

    it("condenses a few lines, not the whole column", () => {
      const lines = new Set(cells.map((c) => Math.floor((c.y - body.y) / 3)));
      expect(lines.size).toBeGreaterThan(3);
      expect(lines.size).toBeLessThanOrEqual(10);
    });

    it("is sparse enough to read as cells, not a solid block", () => {
      const rows = new Set(cells.map((c) => c.y));
      const density = cells.length / (rows.size * body.width);
      expect(density).toBeGreaterThan(0.3);
      expect(density).toBeLessThan(0.7);
    });

    it("is empty for an empty region", () => {
      expect(bodyTextCondensate({ x: 0, y: 10, width: 50, height: 0 }, viewport, mulberry32(1))).toEqual([]);
    });
  });
});
