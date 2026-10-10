/**
 * How big a Cell is drawn. Pure.
 *
 * A CSS pixel is about the same apparent size on every device (that's what browsers
 * scale it for), so cells of a fixed number of CSS pixels make cell text about the same
 * physical size on a phone, a laptop and a desktop. Only a viewport too narrow for the
 * narrowest layout (the stacked name) shrinks them, just enough for it to fit. The layout
 * reflows to the cells across instead (see the Cell Typesetter).
 */
import { MIN_VIEWPORT_CELLS } from "./cell-typesetter";

/** A Cell's size in CSS pixels wherever the viewport has room. */
const CELL_PX = 6;

/**
 * A Cell's size in CSS pixels for a viewport `viewportPx` CSS pixels wide, on a screen
 * with `dpr` device pixels per CSS pixel. Always a whole number of device pixels (at
 * least one), so cells stay crisp.
 */
export function cellSize(viewportPx: number, dpr: number): number {
  const fit = Math.min(CELL_PX, viewportPx / MIN_VIEWPORT_CELLS);
  return Math.max(1, Math.floor(fit * dpr)) / dpr;
}
