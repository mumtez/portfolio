/**
 * HTML regions: where the page's real HTML (Body Text, Frames' media) lies over the
 * Grid, in cells. Pure; the Grid script measures the elements and passes their boxes in.
 */
import type { Box } from "./cell-typesetter";

/** An element's box in CSS pixels, as `getBoundingClientRect` gives it. */
export interface PixelRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The cells `rect` covers, even partly, clipped to `within` (the viewport, or the scroll
 * box the element shows in). Undefined if none.
 */
export function cellBoxCovering(rect: PixelRect, cellPx: number, within: Box): Box | undefined {
  if (rect.right <= rect.left || rect.bottom <= rect.top) return undefined;
  const x0 = Math.max(within.x, Math.floor(rect.left / cellPx));
  const y0 = Math.max(within.y, Math.floor(rect.top / cellPx));
  const x1 = Math.min(within.x + within.width, Math.ceil(rect.right / cellPx));
  const y1 = Math.min(within.y + within.height, Math.ceil(rect.bottom / cellPx));
  if (x1 <= x0 || y1 <= y0) return undefined;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
