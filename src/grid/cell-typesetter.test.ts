import { describe, expect, it } from "vitest";
import prototypeLayouts from "../../tests/fixtures/prototype-name-layouts.json";
import {
  boxContains,
  nameMask,
  navItemAt,
  textMask,
  typesetSection,
  type Box,
  type CellMask,
} from "./cell-typesetter";
import type { Point } from "./life-engine";
import { boxesOverlap, boxInside, rowsIn, TEST_CONTENT } from "./test-support";

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

    it("has no name layout on other Sections", () => {
      expect(typesetSection(VIEWPORT, TEST_CONTENT, "/about/").nameLayout).toBeUndefined();
    });
  });
});
