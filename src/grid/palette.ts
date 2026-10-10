/**
 * Theme colours, shared by the page CSS and the Grid Renderer so they can't drift.
 * Values come from the prototype (branch `prototype/gol-portfolio`).
 */

export interface Palette {
  readonly background: string;
  /** Pinned Cells: bright, so content stands out above the Free Cells. */
  readonly pinned: string;
  /** Free Cells: true hunter green. */
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
