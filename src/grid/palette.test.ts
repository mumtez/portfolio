import { describe, expect, it } from "vitest";
import { contrastRatio, DARK } from "./palette";

describe("dark palette", () => {
  it("uses the hunter greens", () => {
    expect(DARK.pinned.toUpperCase()).toBe("#4F9A5E");
    expect(DARK.free.toUpperCase()).toBe("#355E3B");
  });

  it("has a near-black, green-tinted background", () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(DARK.background.slice(i, i + 2), 16));
    expect(Math.max(r, g, b)).toBeLessThan(0x20);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("measures contrast like WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("keeps Pinned Cells and text readable against the background (WCAG AA)", () => {
    expect(contrastRatio(DARK.pinned, DARK.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK.text, DARK.background)).toBeGreaterThanOrEqual(4.5);
  });
});
