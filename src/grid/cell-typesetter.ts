/**
 * Cell Typesetter: turns content into Pinned Cell masks. Pure, headless.
 */
import type { Point } from "./life-engine";

/** A set of cells inside a width×height box, with (0,0) at its top-left. */
export interface CellMask {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly Point[];
}

/**
 * The name glyphs: bold caps, 9 cells tall, 2-cell vertical strokes, 1-cell horizontals.
 *
 * FROZEN. Copied verbatim from `prototype/name_layout.py` on branch
 * `prototype/gol-portfolio`. The Intro Seeds evolve into exactly this layout under
 * strict Life (ADR 0003), so changing a glyph or a gap invalidates every seed.
 */
const NAME_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: [".#####.", "##...##", "##...##", "##...##", "#######", "##...##", "##...##", "##...##", "##...##"],
  N: ["##...##", "###..##", "####.##", "#######", "##.####", "##..###", "##...##", "##...##", "##...##"],
  D: ["######.", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", "######."],
  R: ["######.", "##...##", "##...##", "##...##", "######.", "##.##..", "##..##.", "##...##", "##...##"],
  E: ["#######", "##.....", "##.....", "##.....", "######.", "##.....", "##.....", "##.....", "#######"],
  W: ["##...##", "##...##", "##...##", "##...##", "##.#.##", "##.#.##", "#######", "###.###", "##...##"],
  B: ["######.", "##...##", "##...##", "##...##", "######.", "##...##", "##...##", "##...##", "######."],
  U: ["##...##", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", ".#####."],
  S: [".######", "##.....", "##.....", "##.....", ".#####.", ".....##", ".....##", ".....##", "######."],
  T: ["######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
  M: ["##...##", "###.###", "#######", "##.#.##", "##.#.##", "##...##", "##...##", "##...##", "##...##"],
};
const NAME_HEIGHT = 9;
const NAME_LETTER_GAP = 2;
const NAME_WORD_GAP = 5;
/** Blank rows between the two lines of the stacked name. */
const NAME_LINE_GAP = 4;
const NAME_WORDS = ["ANDREW", "ABURUSTUM"] as const;

/** One line on wide screens (135×9); two centred lines when that doesn't fit (78×22). */
export type NameLayout = "one-line" | "stacked";

function wordRows(word: string): string[] {
  let rows: string[] = Array(NAME_HEIGHT).fill("");
  [...word].forEach((ch, i) => {
    const glyph = NAME_GLYPHS[ch];
    const gap = i ? ".".repeat(NAME_LETTER_GAP) : "";
    rows = rows.map((r, y) => r + gap + glyph[y]);
  });
  return rows;
}

function maskFromRows(rows: readonly string[]): CellMask {
  const cells: Point[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "#") cells.push({ x, y });
  });
  return { width: rows[0].length, height: rows.length, cells };
}

/** The name as a Pinned Cell mask. */
export function nameMask(layout: NameLayout): CellMask {
  const [first, last] = NAME_WORDS.map(wordRows);
  if (layout === "one-line") {
    return maskFromRows(first.map((r, y) => r + ".".repeat(NAME_WORD_GAP) + last[y]));
  }
  const width = last[0].length;
  const pad = Math.floor((width - first[0].length) / 2);
  const centred = first.map((r) => ".".repeat(pad) + r.padEnd(width - pad, "."));
  return maskFromRows([...centred, ...Array<string>(NAME_LINE_GAP).fill(".".repeat(width)), ...last]);
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function boxContains(box: Box, { x, y }: Point): boolean {
  return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
}

export interface ViewportCells {
  readonly width: number;
  readonly height: number;
}

export interface HomeLayout {
  /** Every Pinned Cell on Home, in viewport coordinates. */
  readonly pinned: readonly Point[];
  /** Where the name sits; the tagline goes below it. */
  readonly name: Box;
  /** Which name layout is in `name`, so the Intro can pick a matching Intro Seed. */
  readonly nameLayout: NameLayout;
}

/** The name's bottom edge sits at this fraction of the viewport height. */
const NAME_BASELINE = 0.45;

export function typesetHome(viewport: ViewportCells): HomeLayout {
  const nameLayout: NameLayout = "one-line";
  const mask = nameMask(nameLayout);
  const x = Math.floor((viewport.width - mask.width) / 2);
  const y = Math.max(0, Math.floor(viewport.height * NAME_BASELINE) - mask.height);
  return {
    pinned: mask.cells.map((c) => ({ x: c.x + x, y: c.y + y })),
    name: { x, y, width: mask.width, height: mask.height },
    nameLayout,
  };
}
