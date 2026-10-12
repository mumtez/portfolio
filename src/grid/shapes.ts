/**
 * Shapes: where a Section's Body Text lies over the Grid, in cells. The page measures
 * them from its real HTML and hands them to the Grid Director as plain data, so the
 * Director stays headless. A Transition dissolves the old Section's shapes into Life and
 * condenses the next Section's out of it.
 */
import type { Box } from "./cell-typesetter";
import type { Point } from "./life-engine";

/** How a Panel's border is drawn: pinned, every other cell pinned, or a Button that decays on hover. */
export type PanelKind = "solid" | "dashed" | "button";

/** One rendered line box of Body Text. */
export interface LineShape {
  readonly kind: "line";
  readonly box: Box;
}

/** A Panel: a block of Body Text inside a border of Cells. Its box includes the border. */
export interface PanelShape {
  readonly kind: "panel";
  readonly panel: PanelKind;
  readonly box: Box;
}

export type Shape = LineShape | PanelShape;

/** The ink fills this share of a line's rows, like the x-height of a line of text. */
const INK_ROWS = 0.6;
/** Chance that a Cell in a line's ink rows is alive. */
const INK_DENSITY = 0.55;

/**
 * The Cells a line of Body Text is drawn as while it condenses or dissolves: a ragged
 * band through the middle of its box, so it reads as a line of text, not a block.
 */
export function lineInk({ x, y, width, height }: Box, random: () => number): Point[] {
  const rows = Math.max(1, Math.round(height * INK_ROWS));
  const top = y + Math.floor((height - rows) / 2);
  const cells: Point[] = [];
  for (let row = top; row < top + rows; row++)
    for (let dx = 0; dx < width; dx++)
      if (random() < INK_DENSITY) cells.push({ x: x + dx, y: row });
  return cells;
}

/** The line shapes among `shapes`. */
export function lines(shapes: readonly Shape[]): LineShape[] {
  return shapes.filter((s): s is LineShape => s.kind === "line");
}
