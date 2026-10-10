import { describe, expect, it } from "vitest";
import { cellSize } from "./cell-size";
import { MIN_VIEWPORT_CELLS } from "./cell-typesetter";

const cellsAcross = (widthPx: number, dpr: number) => Math.ceil(widthPx / cellSize(widthPx, dpr));

describe("cell size", () => {
  it("is the same size in CSS pixels on every laptop and desktop, so cell text is the same size", () => {
    const sizes = [1024, 1280, 1440, 1920, 2560].map((w) => cellSize(w, 2));
    expect(new Set(sizes).size).toBe(1);
    expect(sizes[0]).toBeGreaterThanOrEqual(5);
    expect(sizes[0]).toBeLessThanOrEqual(8);
  });

  it("doesn't depend on the display's pixel density on a wide viewport", () => {
    expect(cellSize(1440, 1)).toBe(cellSize(1440, 2));
  });

  it.each([
    [390, 3],
    [375, 2],
    [360, 3],
    [320, 2],
  ])("shrinks on a %ipx-wide phone (@%ix) only as far as the stacked name needs", (width, dpr) => {
    const across = cellsAcross(width, dpr);
    expect(across).toBeGreaterThanOrEqual(MIN_VIEWPORT_CELLS);
    // As big as the stacked name allows: one device pixel more would no longer fit.
    expect(Math.floor(width / (cellSize(width, dpr) + 1 / dpr))).toBeLessThan(MIN_VIEWPORT_CELLS);
  });

  it("keeps cells on a phone much closer to a desktop's size than a fixed cell count would (≥ 4 CSS px at 390)", () => {
    expect(cellSize(390, 3)).toBeGreaterThanOrEqual(4);
    expect(cellSize(390, 3) / cellSize(1440, 2)).toBeGreaterThan(0.6);
  });

  it.each([
    [390, 3],
    [412, 2.625],
    [1440, 2],
    [1366, 1],
  ])("is a whole number of device pixels at %ipx @%ix, so cells stay crisp", (width, dpr) => {
    const devicePx = cellSize(width, dpr) * dpr;
    expect(Math.abs(devicePx - Math.round(devicePx))).toBeLessThan(1e-9);
  });

  it("never drops below one device pixel", () => {
    expect(cellSize(40, 1)).toBe(1);
  });
});
