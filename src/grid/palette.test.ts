import { describe, expect, it } from "vitest";
import { BODY_TEXT_CELL_ALPHA, contrastRatio, DARK } from "./palette";

/** `fg` drawn at `alpha` over `bg`, as `#rrggbb`. */
function over(fg: string, alpha: number, bg: string): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [f, b] = [channels(fg), channels(bg)];
  return `#${f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
}

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

  it("keeps Body Text above 7:1 (WCAG AAA) over the faint Free Cells drawn under it", () => {
    expect(contrastRatio(DARK.text, over(DARK.free, BODY_TEXT_CELL_ALPHA, DARK.background))).toBeGreaterThanOrEqual(7);
  });

  it("needs the cells under Body Text drawn faint: at full strength they'd pull it below 7:1", () => {
    expect(contrastRatio(DARK.text, DARK.free)).toBeLessThan(7);
  });
});
