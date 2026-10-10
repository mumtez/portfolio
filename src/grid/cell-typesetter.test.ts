import { describe, expect, it } from "vitest";
import prototypeLayouts from "../../tests/fixtures/prototype-name-layouts.json";
import { nameMask, typesetHome, type CellMask } from "./cell-typesetter";

/** Render a mask as rows of '#' (pinned) and '.' (empty), the prototype's format. */
function toRows(mask: CellMask): string[] {
  const rows = Array.from({ length: mask.height }, () => Array<string>(mask.width).fill("."));
  for (const { x, y } of mask.cells) rows[y][x] = "#";
  return rows.map((r) => r.join(""));
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

  describe("Home", () => {
    it("centres the one-line name horizontally and pins exactly its cells", () => {
      const home = typesetHome({ width: 201, height: 60 });
      expect(home.nameLayout).toBe("one-line");
      expect(home.name).toMatchObject({ x: 33, width: 135, height: 9 });
      const { x, y } = home.name;
      const expected = nameMask("one-line").cells.map((c) => `${c.x + x},${c.y + y}`);
      expect(home.pinned.map((c) => `${c.x},${c.y}`).sort()).toEqual(expected.sort());
    });

    it("places the name fully inside the viewport, above the middle", () => {
      const home = typesetHome({ width: 160, height: 50 });
      expect(home.name.y).toBeGreaterThanOrEqual(0);
      expect(home.name.y + home.name.height).toBeLessThanOrEqual(25);
    });
  });
});
