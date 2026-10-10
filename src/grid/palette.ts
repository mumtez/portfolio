/**
 * Theme colours, shared by the page CSS and the Grid Renderer so they can't drift.
 * Values come from the prototype (branch `prototype/gol-portfolio`).
 */

export interface Palette {
  readonly background: string;
  /** Pinned Cells: the strongest against the background, so content stands out above the Free Cells. */
  readonly pinned: string;
  /** Free Cells: true hunter green in the dark theme, pale sage in the light one. */
  readonly free: string;
  /** HTML text over the Grid. */
  readonly text: string;
}

export const DARK: Palette = {
  background: "#0c120e",
  pinned: "#4F9A5E",
  free: "#355E3B",
  text: "#dbe7dd",
};

export const LIGHT: Palette = {
  /** Cream. */
  background: "#f3eedf",
  /** Hunter green, which is dark against cream. */
  pinned: "#355E3B",
  /** Pale sage. */
  free: "#b5c9a8",
  text: "#1e2a21",
};

export type Theme = "light" | "dark";

export const PALETTES: Readonly<Record<Theme, Palette>> = { light: LIGHT, dark: DARK };

/**
 * Cells under Body Text (its region of the Grid) are drawn at this opacity, like the
 * Fringe, so the HTML over them keeps its contrast.
 */
export const BODY_TEXT_CELL_ALPHA = 0.22;

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 0xff, n & 0xff].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
