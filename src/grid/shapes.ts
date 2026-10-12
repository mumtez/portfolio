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
  /**
   * The part of the Panel that shows, when it's scrolled partly out of sight: only its
   * border and interior Cells in here are drawn. The whole box when left out.
   */
  readonly clip?: Box;
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

/** A Panel's Cells: its border, pinned (every other cell for a dashed Panel), and its interior, walled off. */
export interface PanelCells {
  readonly border: Point[];
  readonly interior: Point[];
}

/**
 * The Cells the Panels among `shapes` are drawn with: each border going round its box's
 * edge, every other cell of it for a dashed Panel, and each interior inside that edge,
 * all within the Panel's clip.
 */
export function panelCells(shapes: readonly Shape[]): PanelCells {
  const border: Point[] = [];
  const interior: Point[] = [];
  for (const s of shapes) {
    if (s.kind !== "panel") continue;
    const shows = (p: Point) => !s.clip || boxHolds(s.clip, p);
    edgeRound(s.box).forEach((p, i) => {
      if ((s.panel !== "dashed" || i % 2 === 0) && shows(p)) border.push(p);
    });
    const { x, y, width, height } = s.box;
    for (let cy = y + 1; cy < y + height - 1; cy++)
      for (let cx = x + 1; cx < x + width - 1; cx++)
        if (shows({ x: cx, y: cy })) interior.push({ x: cx, y: cy });
  }
  return { border, interior };
}

/** The Cells on the edge of `box`, each once, in order going round it from its top-left corner. */
function edgeRound({ x, y, width, height }: Box): Point[] {
  const out: Point[] = [];
  if (width <= 2 || height <= 2) {
    for (let dy = 0; dy < height; dy++)
      for (let dx = 0; dx < width; dx++) out.push({ x: x + dx, y: y + dy });
    return out;
  }
  for (let dx = 0; dx < width; dx++) out.push({ x: x + dx, y });
  for (let dy = 1; dy < height; dy++) out.push({ x: x + width - 1, y: y + dy });
  for (let dx = width - 2; dx >= 0; dx--) out.push({ x: x + dx, y: y + height - 1 });
  for (let dy = height - 2; dy > 0; dy--) out.push({ x, y: y + dy });
  return out;
}

function boxHolds(box: Box, { x, y }: Point): boolean {
  return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
}

/** The line shapes among `shapes`. */
export function lines(shapes: readonly Shape[]): LineShape[] {
  return shapes.filter((s): s is LineShape => s.kind === "line");
}
