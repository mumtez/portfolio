/**
 * Cell Typesetter: turns content into Pinned Cell masks. Pure, headless.
 */
import { FONT_5X7 } from "./font-5x7";
import type { Point } from "./life-engine";
import { currentness, type GridContent } from "./routes";

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

/** Rows of every glyph in the 5×7 font. */
const GLYPH_HEIGHT = FONT_5X7.A.length;
const GLYPH_WIDTH = FONT_5X7.A[0].length;
const BLANK_GLYPH: readonly string[] = Array(GLYPH_HEIGHT).fill(".".repeat(GLYPH_WIDTH));
/** Cells between glyphs. A space is a blank glyph, so words sit 7 cells apart. */
const LETTER_GAP = 1;

/** One line of text in the 5×7 font, in capitals. Characters the font lacks are left blank. */
export function textMask(text: string): CellMask {
  let rows: string[] = Array(GLYPH_HEIGHT).fill("");
  [...text.toUpperCase()].forEach((ch, i) => {
    const glyph = FONT_5X7[ch] ?? BLANK_GLYPH;
    const gap = i ? ".".repeat(LETTER_GAP) : "";
    rows = rows.map((r, y) => r + gap + glyph[y]);
  });
  return maskFromRows(rows);
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
  /**
   * CSS pixels per cell (default 8). The Body Text is HTML set in CSS pixels, so its
   * region and line spacing in cells depend on it.
   */
  readonly cellPx?: number;
}

/** One link in the nav, drawn in cells as a button: its label inside a border. */
export interface NavItem {
  /** The Section it goes to. */
  readonly path: string;
  readonly label: string;
  /** Its hit region: the button out to and including its border. */
  readonly box: Box;
  /** The border's Pinned Cells: the edge of `box`, kept apart so it can be released on its own. */
  readonly border: readonly Point[];
  /** True for the Section on screen (or, on a Deep Dive, for Projects). Drawn underlined. */
  readonly current: boolean;
}

/** Everything one Section pins, for a given viewport. */
export interface SectionLayout {
  /** Every Pinned Cell, in viewport coordinates: the title and the nav. */
  readonly pinned: readonly Point[];
  /**
   * The name on Home, the heading elsewhere; the Section's HTML content goes below it.
   * Zero height at a path the Grid has no Section for.
   */
  readonly title: Box;
  /** On Home only: which name layout `title` holds, so the Intro can pick a matching Intro Seed. */
  readonly nameLayout?: NameLayout;
  readonly nav: readonly NavItem[];
  /**
   * Where the Section's Body Text (its HTML content) lies over the Grid: the centred
   * text column below the title, down to the bottom of the viewport. Pins nothing.
   */
  readonly body: Box;
}

/** Rows above the nav. */
const NAV_TOP = 3;
/** Cells between one nav label and the next on the same line; both their borders sit in this gap. */
const NAV_GAP = 8;
/** From a button's label (and underline) out to its border: one clear cell, then the border. */
const BUTTON_PAD = 2;
/** The current item's underline is this many rows below the top of its label. */
const UNDERLINE_ROW = GLYPH_HEIGHT + 1;
const BUTTON_HEIGHT = UNDERLINE_ROW + 1 + 2 * BUTTON_PAD;
/** Clear rows between one line of buttons and the next. */
const NAV_LINE_GAP = 2;
const NAV_LINE_PITCH = BUTTON_HEIGHT + NAV_LINE_GAP;
/** Cells kept clear at the viewport's left and right edges. */
const SIDE = 3;
/** Rows between the nav and the title. */
const TITLE_GAP = 4;
/** Rows from the top of one heading line to the next. */
const HEADING_LINE_PITCH = GLYPH_HEIGHT + 3;
/** The name's bottom edge sits at this fraction of the viewport height, unless the nav pushes it down. */
const NAME_BASELINE = 0.45;

/** Cells across a mask needs: the mask plus `SIDE` clear at each side. */
const widthWithSides = (mask: CellMask) => mask.width + 2 * SIDE;
const STACKED_NAME = nameMask("stacked");
const ONE_LINE_MIN_CELLS = widthWithSides(nameMask("one-line"));

/** Fewest cells across a viewport needs for the narrowest layout: the stacked name with its sides. */
export const MIN_VIEWPORT_CELLS = widthWithSides(STACKED_NAME);

/** The one-line name wherever it fits, else the stacked name. */
function nameLayoutFor(viewport: ViewportCells): NameLayout {
  return viewport.width >= ONE_LINE_MIN_CELLS ? "one-line" : "stacked";
}

/** The top row of the nav's `row`th line (its hit regions), so also the bottom of the `row` lines above it. */
const navRowTop = (row: number) => NAV_TOP + row * NAV_LINE_PITCH;

/** Lay out the Section at `path` (normalised, e.g. `/about/`) for a viewport. */
export function typesetSection(viewport: ViewportCells, content: GridContent, path: string): SectionLayout {
  const pinned: Point[] = [];
  const place = (mask: CellMask, x: number, y: number) => {
    for (const c of mask.cells) pinned.push({ x: c.x + x, y: c.y + y });
  };

  const nav = typesetNav(viewport, content, path, place);
  const navBottom = Math.max(NAV_TOP, ...nav.map((i) => i.box.y + i.box.height));
  const top = navBottom + TITLE_GAP;

  if (path === "/") {
    const nameLayout = nameLayoutFor(viewport);
    const mask = nameMask(nameLayout);
    const x = Math.floor((viewport.width - mask.width) / 2);
    const y = Math.max(top, Math.floor(viewport.height * NAME_BASELINE) - mask.height);
    place(mask, x, y);
    const title = { x, y, width: mask.width, height: mask.height };
    return { pinned, title, nameLayout, nav, body: bodyRegion(viewport, title) };
  }

  const section = content.sections.find((s) => s.path === path);
  if (!section) {
    const title = { x: 0, y: top, width: viewport.width, height: 0 };
    return { pinned, title, nav, body: bodyRegion(viewport, title) };
  }

  const lines = wrap(section.heading, viewport.width - 2 * SIDE).map(textMask);
  const width = Math.max(...lines.map((l) => l.width));
  const x0 = Math.floor((viewport.width - width) / 2);
  lines.forEach((line, i) => place(line, Math.floor((viewport.width - line.width) / 2), top + i * HEADING_LINE_PITCH));
  const height = (lines.length - 1) * HEADING_LINE_PITCH + GLYPH_HEIGHT;
  const title = { x: x0, y: top, width, height };
  return { pinned, title, nav, body: bodyRegion(viewport, title) };
}

/** The nav item whose hit region holds `at`, if any. */
export function navItemAt(layout: SectionLayout, at: Point): NavItem | undefined {
  return layout.nav.find((item) => boxContains(item.box, at));
}

function typesetNav(
  viewport: ViewportCells,
  content: GridContent,
  path: string,
  place: (mask: CellMask, x: number, y: number) => void,
): NavItem[] {
  const entries = content.sections.flatMap((s) => (s.nav ? [{ path: s.path, label: s.nav, mask: textMask(s.nav) }] : []));
  const maxWidth = viewport.width - 2 * SIDE;
  const column = navIsColumn(viewport, entries.length);
  const lines: (typeof entries)[] = [];
  let lineWidth = 0;
  for (const entry of entries) {
    const line = lines.at(-1);
    if (line && !column && lineWidth + NAV_GAP + entry.mask.width <= maxWidth) {
      line.push(entry);
      lineWidth += NAV_GAP + entry.mask.width;
    } else {
      lines.push([entry]);
      lineWidth = entry.mask.width;
    }
  }

  const items: NavItem[] = [];
  lines.forEach((line, row) => {
    const width = line.reduce((sum, e) => sum + e.mask.width, 0) + NAV_GAP * (line.length - 1);
    let x = Math.floor((viewport.width - width) / 2);
    const y = navRowTop(row) + BUTTON_PAD;
    for (const { path: to, label, mask } of line) {
      const current = currentness(to, path) !== undefined;
      const box = { x: x - BUTTON_PAD, y: y - BUTTON_PAD, width: mask.width + 2 * BUTTON_PAD, height: BUTTON_HEIGHT };
      const border = edgeCells(box);
      place(mask, x, y);
      if (current) place(underline(mask.width), x, y + UNDERLINE_ROW);
      place({ ...box, cells: border }, 0, 0);
      items.push({ path: to, label, current, box, border });
      x += mask.width + NAV_GAP;
    }
  });
  return items;
}

/** The cells on the edge of `box`, each once. */
function edgeCells({ x, y, width, height }: Box): Point[] {
  const cells: Point[] = [];
  for (let cx = x; cx < x + width; cx++) cells.push({ x: cx, y }, { x: cx, y: y + height - 1 });
  for (let cy = y + 1; cy < y + height - 1; cy++) cells.push({ x, y: cy }, { x: x + width - 1, y: cy });
  return cells;
}

/**
 * Whether the nav stacks into a single column: on a narrow viewport (one that gets the
 * stacked name), as long as the stacked name still fits below the column. A short one (a
 * phone on its side) wraps the nav into rows instead. It depends on the viewport alone,
 * so every Section has the same nav and a Transition leaves it pinned.
 */
function navIsColumn(viewport: ViewportCells, items: number): boolean {
  return nameLayoutFor(viewport) === "stacked" && navRowTop(items) + TITLE_GAP + STACKED_NAME.height <= viewport.height;
}

function underline(width: number): CellMask {
  return { width, height: 1, cells: Array.from({ length: width }, (_, x) => ({ x, y: 0 })) };
}

/** Split `text` into lines no wider than `maxWidth` cells, breaking between words. */
function wrap(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const line = lines.at(-1);
    if (line !== undefined && textMask(`${line} ${word}`).width <= maxWidth) lines[lines.length - 1] = `${line} ${word}`;
    else lines.push(word);
  }
  return lines.length ? lines : [""];
}

/*
 * Body Text. These mirror the page CSS for the Section's content when the Grid is on
 * (`Base.astro` and `Section.astro`): it starts 1.25rem below the title, in a centred
 * column at most 44rem wide with at least 16px either side, with 16px type at a
 * line-height of 1.55.
 */
const DEFAULT_CELL_PX = 8;
const BODY_GAP_PX = 20;
const BODY_COLUMN_PX = 704;
const BODY_GUTTER_PX = 16;
const BODY_LINE_PX = 16 * 1.55;
/** The condensate fills this share of each line's rows, like the x-height of a line of text. */
const CONDENSATE_INK_ROWS = 0.6;
/** Chance that a Cell on a condensate line is alive. */
const CONDENSATE_DENSITY = 0.55;
/** Lines the condensate holds at most: enough to read as a paragraph, not a wall. */
const CONDENSATE_MAX_LINES = 8;

function bodyRegion(viewport: ViewportCells, title: Box): Box {
  const cellPx = viewport.cellPx ?? DEFAULT_CELL_PX;
  const gutter = Math.max(BODY_GUTTER_PX, (viewport.width * cellPx - BODY_COLUMN_PX) / 2);
  const x = Math.min(Math.ceil(gutter / cellPx), Math.floor(viewport.width / 2));
  const y = Math.min(title.y + title.height + Math.ceil(BODY_GAP_PX / cellPx), viewport.height);
  return { x, y, width: viewport.width - 2 * x, height: viewport.height - y };
}

/**
 * The cells a Section's Body Text condenses out of as it arrives (ADR 0004): a few
 * lines of scattered cells shaped like a paragraph at the top of its region, ragged on
 * the right. The Grid Director pins them during a Transition, then releases them into
 * Life as the HTML fades in over them.
 */
export function bodyTextCondensate(body: Box, viewport: ViewportCells, random: () => number): Point[] {
  const cellPx = viewport.cellPx ?? DEFAULT_CELL_PX;
  const pitch = Math.max(2, Math.round(BODY_LINE_PX / cellPx));
  const ink = Math.ceil(pitch * CONDENSATE_INK_ROWS);
  const lines = Math.min(CONDENSATE_MAX_LINES, Math.floor(body.height / pitch));
  const cells: Point[] = [];
  for (let line = 0; line < lines; line++) {
    const length = Math.round(body.width * (0.75 + 0.25 * random()));
    for (let row = 0; row < ink; row++) {
      const y = body.y + line * pitch + row;
      for (let dx = 0; dx < length; dx++) if (random() < CONDENSATE_DENSITY) cells.push({ x: body.x + dx, y });
    }
  }
  return cells;
}
