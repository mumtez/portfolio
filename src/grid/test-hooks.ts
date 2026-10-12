/**
 * What the browser tests can read of the running Grid, to check it against the page:
 * one namespace on `window`, there only when a test has asked for it by setting
 * `window.wantsGridTest` before the page's scripts run (the e2e fixtures do).
 */
import type { Box } from "./box";
import type { Shape } from "./shapes";

export interface GridTestHooks {
  /** The Body Text's shapes the Grid last measured, and its cell size in CSS pixels. */
  shapes(): { cellPx: number; shapes: readonly Shape[] };
  /** Where the Grid last drew the Cells under the Body Text faint, in cells. */
  bodyText(): Box;
  /** The Cell at (x, y) in viewport cells, as the Life Engine has it now. */
  cell(x: number, y: number): { pinned: boolean; wall: boolean };
}

declare global {
  interface Window {
    /** Set by a browser test before the page loads, so the Grid exposes `gridTest`. */
    wantsGridTest?: boolean;
    gridTest?: GridTestHooks;
  }
}

/** Expose `hooks` as `window.gridTest` if a test asked for them. Returns a function that takes them away. */
export function exposeTestHooks(hooks: GridTestHooks): () => void {
  if (!window.wantsGridTest) return () => {};
  window.gridTest = hooks;
  return () => {
    if (window.gridTest === hooks) delete window.gridTest;
  };
}
