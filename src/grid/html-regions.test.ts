import { describe, expect, it } from "vitest";
import { cellBoxCovering } from "./html-regions";

const VIEW = { x: 0, y: 0, width: 100, height: 80 };

describe("the cells an HTML box covers", () => {
  it("covers every cell the box touches, partly or wholly", () => {
    // 8px cells: 20..61px across is cells 2..7, 4..12px down is cells 0..1.
    expect(cellBoxCovering({ left: 20, top: 4, right: 61, bottom: 12 }, 8, VIEW)).toEqual({
      x: 2,
      y: 0,
      width: 6,
      height: 2,
    });
  });

  it("covers exactly the cells of a box on cell edges", () => {
    expect(cellBoxCovering({ left: 16, top: 16, right: 32, bottom: 40 }, 8, VIEW)).toEqual({
      x: 2,
      y: 2,
      width: 2,
      height: 3,
    });
  });

  it("is clipped to the region it shows in, such as a scroll box", () => {
    const scrollBox = { x: 0, y: 30, width: 100, height: 50 };
    expect(cellBoxCovering({ left: 0, top: 200, right: 80, bottom: 400 }, 8, scrollBox)).toEqual({
      x: 0,
      y: 30,
      width: 10,
      height: 20,
    });
  });

  it("is nothing when the box is scrolled out of the region", () => {
    const scrollBox = { x: 0, y: 30, width: 100, height: 50 };
    expect(cellBoxCovering({ left: 0, top: 0, right: 80, bottom: 200 }, 8, scrollBox)).toBeUndefined();
  });

  it("is nothing for an empty box", () => {
    expect(cellBoxCovering({ left: 10, top: 10, right: 10, bottom: 50 }, 8, VIEW)).toBeUndefined();
  });
});
