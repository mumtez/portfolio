import { describe, expect, it } from "vitest";
import { cellLine } from "./pointer-trail";

const keys = (points: { x: number; y: number }[]) => points.map((p) => `${p.x},${p.y}`);

describe("cellLine", () => {
  it("is the one cell when both ends are the same", () => {
    expect(keys(cellLine({ x: 3, y: 4 }, { x: 3, y: 4 }))).toEqual(["3,4"]);
  });

  it("joins the ends with no gaps, in order", () => {
    expect(keys(cellLine({ x: 0, y: 0 }, { x: 4, y: 0 }))).toEqual(["0,0", "1,0", "2,0", "3,0", "4,0"]);
    expect(keys(cellLine({ x: 2, y: 2 }, { x: 0, y: 0 }))).toEqual(["2,2", "1,1", "0,0"]);
  });

  it("steps one cell at a time along a shallow slope", () => {
    const line = cellLine({ x: 0, y: 0 }, { x: 6, y: 2 });
    expect(line).toHaveLength(7);
    for (let k = 1; k < line.length; k++) {
      expect(Math.abs(line[k].x - line[k - 1].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(line[k].y - line[k - 1].y)).toBeLessThanOrEqual(1);
    }
    expect(line.at(-1)).toEqual({ x: 6, y: 2 });
  });
});
