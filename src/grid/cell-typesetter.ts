/**
 * Cell Typesetter: turns content into Pinned Cell masks. Pure, headless.
 */
import { boxContains, boxesOverlap, edgeCells, spanOverlap, type Box } from "./box";
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
  A: [
    ".#####.",
    "##...##",
    "##...##",
    "##...##",
    "#######",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
  ],
  N: [
    "##...##",
    "###..##",
    "####.##",
    "#######",
    "##.####",
    "##..###",
    "##...##",
    "##...##",
    "##...##",
  ],
  D: [
    "######.",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "######.",
  ],
  R: [
    "######.",
    "##...##",
    "##...##",
    "##...##",
    "######.",
    "##.##..",
    "##..##.",
    "##...##",
    "##...##",
  ],
  E: [
    "#######",
    "##.....",
    "##.....",
    "##.....",
    "######.",
    "##.....",
    "##.....",
    "##.....",
    "#######",
  ],
  W: [
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "##.#.##",
    "##.#.##",
    "#######",
    "###.###",
    "##...##",
  ],
  B: [
    "######.",
    "##...##",
    "##...##",
    "##...##",
    "######.",
    "##...##",
    "##...##",
    "##...##",
    "######.",
  ],
  U: [
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
    ".#####.",
  ],
  S: [
    ".######",
    "##.....",
    "##.....",
    "##.....",
    ".#####.",
    ".....##",
    ".....##",
    ".....##",
    "######.",
  ],
  T: ["######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
  M: [
    "##...##",
    "###.###",
    "#######",
    "##.#.##",
    "##.#.##",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
  ],
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
  return maskFromRows([
    ...centred,
    ...Array<string>(NAME_LINE_GAP).fill(".".repeat(width)),
    ...last,
  ]);
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

/** Every small cell icon: a toggle's, and the arrow on a Deep Dive's Button back to Projects. */
export const CELL_ICONS = ["sun", "moon", "glider", "arrow-left"] as const;
export type CellIcon = (typeof CELL_ICONS)[number];

/** The small cell icons a toggle can show. */
export type ToggleIcon = Exclude<CellIcon, "arrow-left">;

export function isCellIcon(icon: string | undefined): icon is CellIcon {
  return (CELL_ICONS as readonly (string | undefined)[]).includes(icon);
}

/** A toggle to draw as a small icon button, such as the theme or the simulation. */
export interface ToggleSpec {
  readonly id: string;
  readonly icon: ToggleIcon;
  /** On. Drawn underlined, as the current nav item is. */
  readonly pressed: boolean;
}

/** A toggle drawn in cells as a button: its icon inside a border, in a corner of the viewport or (on a phone) in the nav. */
export interface ToggleItem extends ToggleSpec {
  /** Its hit region: the button out to and including its border. */
  readonly box: Box;
  /** The border's Pinned Cells: the edge of `box`. */
  readonly border: readonly Point[];
}

/** Everything one Section pins, for a given viewport. */
export interface SectionLayout {
  /** Every Pinned Cell, in viewport coordinates: the title, the nav and the toggles. */
  readonly pinned: readonly Point[];
  /**
   * The name on Home, which the Section's HTML content goes below. No other Section
   * draws a heading, so elsewhere it is zero height, along the bottom of the nav.
   */
  readonly title: Box;
  /** On Home only: which name layout `title` holds, so the Intro can pick a matching Intro Seed. */
  readonly nameLayout?: NameLayout;
  readonly nav: readonly NavItem[];
  /**
   * Where the Section's Body Text (its HTML content) lies over the Grid: the centred
   * text column below the title (and the nav, with the toggles in it on a phone), down to
   * the bottom of the viewport, or to the toggles when they're in the bottom corner over
   * the column. Pins nothing.
   */
  readonly body: Box;
  /**
   * The toggles, side by side: in the top-right corner, or the bottom-right one if the nav
   * leaves no room; on a phone held upright, at the end of the nav's last line, right of CONTACT.
   */
  readonly toggles: readonly ToggleItem[];
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
/** Rows of a capital in the 5×7 font: a Cell label is centred on these, not on the row below them. */
export const CAPITAL_ROWS = 7;

/**
 * The size in Cells of a Button drawn round a Cell label (a Contact link's EMAIL), border
 * included: the label's capitals with a clear cell and then the border round them. It
 * has no underline row. The page sizes the link's HTML box to it.
 */
export function cellLabelButton(label: string): { width: number; height: number } {
  return buttonAround(textMask(label));
}

/** The size in Cells of a Button drawn round an icon (a Deep Dive's back arrow), as `cellLabelButton`. */
export function cellIconButton(icon: CellIcon): { width: number; height: number } {
  return buttonAround(iconMask(icon));
}

/** A Button with no underline row round `mask`, which is as tall as the font's capitals. */
function buttonAround(mask: CellMask): { width: number; height: number } {
  return { width: mask.width + 2 * BUTTON_PAD, height: CAPITAL_ROWS + 2 * BUTTON_PAD };
}
/** Clear rows between one line of buttons and the next. */
const NAV_LINE_GAP = 2;
const NAV_LINE_PITCH = BUTTON_HEIGHT + NAV_LINE_GAP;
/** Cells kept clear at the viewport's left and right edges. */
const SIDE = 3;
/** Rows between the nav and Home's name. */
const TITLE_GAP = 4;
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

/** Lay out the Section at `path` (normalised, e.g. `/about/`) for a viewport, with `toggles` as icon Buttons. */
export function typesetSection(
  viewport: ViewportCells,
  content: GridContent,
  path: string,
  toggleSpecs: readonly ToggleSpec[] = [],
): SectionLayout {
  const pinned: Point[] = [];
  const place = (mask: CellMask, x: number, y: number) => {
    for (const c of mask.cells) pinned.push({ x: c.x + x, y: c.y + y });
  };

  const {
    nav,
    toggles,
    bottom: navBottom,
  } = typesetButtons(viewport, content, path, toggleSpecs, place);

  if (path === "/") {
    const top = navBottom + TITLE_GAP;
    const nameLayout = nameLayoutFor(viewport);
    const mask = nameMask(nameLayout);
    const x = Math.floor((viewport.width - mask.width) / 2);
    const y = Math.max(top, Math.floor(viewport.height * NAME_BASELINE) - mask.height);
    place(mask, x, y);
    const title = { x, y, width: mask.width, height: mask.height };
    return { pinned, title, nameLayout, nav, toggles, body: bodyRegion(viewport, title, toggles) };
  }

  // No other Section draws a heading: the underlined nav Button says where you are, and
  // the Body Text starts directly below the nav. Its `h1` stays in the HTML.
  const title = { x: 0, y: navBottom, width: viewport.width, height: 0 };
  return { pinned, title, nav, toggles, body: bodyRegion(viewport, title, toggles) };
}

/** The nav item whose hit region holds `at`, if any. */
export function navItemAt(layout: SectionLayout, at: Point): NavItem | undefined {
  return layout.nav.find((item) => boxContains(item.box, at));
}

/** A Button to set in a line of the nav: a nav item, or (on a phone) a toggle. */
type Slot =
  | { readonly kind: "nav"; readonly path: string; readonly label: string; readonly mask: CellMask }
  | { readonly kind: "toggle"; readonly spec: ToggleSpec; readonly mask: CellMask };

/** Cells across a line of Buttons takes, from its first label to its last. */
const lineWidth = (line: readonly Slot[]) =>
  line.reduce((sum, s) => sum + s.mask.width, 0) + NAV_GAP * (line.length - 1);

/**
 * The nav and the toggles. On a wide screen (or a phone on its side) the nav wraps into
 * as few lines as fit and the toggles go in a corner (see `typesetToggles`). On a phone
 * held upright the nav is four lines, HOME with ABOUT, then EXPERIENCE, PROJECTS and
 * CONTACT, and the toggles join CONTACT's line (see `phoneLines`).
 */
function typesetButtons(
  viewport: ViewportCells,
  content: GridContent,
  path: string,
  toggleSpecs: readonly ToggleSpec[],
  place: (mask: CellMask, x: number, y: number) => void,
): { nav: NavItem[]; toggles: ToggleItem[]; bottom: number } {
  const entries: Slot[] = content.sections.flatMap((s) =>
    s.nav ? [{ kind: "nav" as const, path: s.path, label: s.nav, mask: textMask(s.nav) }] : [],
  );
  const maxWidth = viewport.width - 2 * SIDE;
  if (isPhoneUpright(viewport, entries.length)) {
    const toggleSlots: Slot[] = toggleSpecs.map((spec) => ({
      kind: "toggle",
      spec,
      mask: iconMask(spec.icon),
    }));
    return drawLines(viewport, phoneLines(entries, toggleSlots, maxWidth), path, place);
  }
  const lines: Slot[][] = [];
  for (const entry of entries) {
    const line = lines.at(-1);
    if (line && lineWidth([...line, entry]) <= maxWidth) line.push(entry);
    else lines.push([entry]);
  }
  const { nav, bottom } = drawLines(viewport, lines, path, place);
  return { nav, bottom, toggles: typesetToggles(viewport, toggleSpecs, nav, place) };
}

/**
 * The phone's lines: the first two nav items share one, every other item has its own,
 * and the toggles join the last, so the nav is a line shorter than a column and the
 * toggles sit inside it, above the Body Text. A line too wide for the viewport falls
 * back to its nav items one per line, then its toggles together on a line of their own.
 */
function phoneLines(
  entries: readonly Slot[],
  toggles: readonly Slot[],
  maxWidth: number,
): Slot[][] {
  const lines = [entries.slice(0, 2), ...entries.slice(2).map((e) => [e])].filter((l) => l.length);
  if (lines.length) lines[lines.length - 1] = [...lines[lines.length - 1], ...toggles];
  else if (toggles.length) lines.push([...toggles]);
  return lines.flatMap((line) => {
    if (lineWidth(line) <= maxWidth) return [line];
    const navs = line.filter((s) => s.kind === "nav").map((s) => [s]);
    const rest = line.filter((s) => s.kind === "toggle");
    return rest.length ? [...navs, rest] : navs;
  });
}

/** Draw lines of Buttons, each centred, one nav line pitch apart from the top; `bottom` is below the last. */
function drawLines(
  viewport: ViewportCells,
  lines: readonly (readonly Slot[])[],
  path: string,
  place: (mask: CellMask, x: number, y: number) => void,
): { nav: NavItem[]; toggles: ToggleItem[]; bottom: number } {
  const nav: NavItem[] = [];
  const toggles: ToggleItem[] = [];
  lines.forEach((line, row) => {
    let x = Math.floor((viewport.width - lineWidth(line)) / 2);
    const y = navRowTop(row) + BUTTON_PAD;
    for (const slot of line) {
      if (slot.kind === "nav") {
        const current = currentness(slot.path, path) !== undefined;
        const button = drawButton(slot.mask, x, y, current, place);
        nav.push({ path: slot.path, label: slot.label, current, ...button });
      } else {
        toggles.push({ ...slot.spec, ...drawButton(slot.mask, x, y, slot.spec.pressed, place) });
      }
      x += slot.mask.width + NAV_GAP;
    }
  });
  return { nav, toggles, bottom: Math.max(NAV_TOP, navRowTop(lines.length) - NAV_LINE_GAP) };
}

/** Cells between the toggles, and from the last one to the viewport's right and bottom edges. */
const TOGGLE_GAP = 4;
/** Clear cells kept at least between the toggles and a nav Button beside them. */
const TOGGLE_NAV_GAP = 2;

/**
 * The cell icons, 7 cells tall like the 5×7 font's capitals, so a toggle's underlines like
 * a nav label and the back arrow centres like a Cell label.
 */
const ICON_MASKS: Readonly<Record<CellIcon, CellMask>> = {
  "sun": maskFromRows([
    "...#...",
    ".#...#.",
    "..###..",
    "#.###.#",
    "..###..",
    ".#...#.",
    "...#...",
  ]),
  "moon": maskFromRows([
    "..####.",
    ".##....",
    "##.....",
    "##.....",
    "##.....",
    ".##....",
    "..####.",
  ]),
  "glider": maskFromRows([
    ".......",
    "..##...",
    "..##...",
    "....##.",
    "....##.",
    "######.",
    "######.",
  ]),
  "arrow-left": maskFromRows([
    "...#...",
    "..##...",
    ".######",
    "#######",
    ".######",
    "..##...",
    "...#...",
  ]),
};

/** A cell icon as a Pinned Cell mask. */
export function iconMask(icon: CellIcon): CellMask {
  return ICON_MASKS[icon];
}

/**
 * The toggles off a phone: side by side in the top-right corner beside the nav's first
 * line, where they're above the Body Text and never cover it. Where the nav leaves no
 * room there (a wide row of it), they go in the bottom-right corner instead, and the Body
 * Text region ends above them if they share its columns (see `bodyRegion`). On a phone
 * they're in the nav's last line instead (see `phoneLines`).
 */
function typesetToggles(
  viewport: ViewportCells,
  specs: readonly ToggleSpec[],
  nav: readonly NavItem[],
  place: (mask: CellMask, x: number, y: number) => void,
): ToggleItem[] {
  const masks = specs.map((s) => iconMask(s.icon));
  const width =
    masks.reduce((sum, m) => sum + m.width + 2 * BUTTON_PAD, 0) + TOGGLE_GAP * (masks.length - 1);
  const left = viewport.width - SIDE - width;
  // Where they'd go at the top, with the gap they keep from the nav at their left.
  const top: Box = {
    x: left - TOGGLE_NAV_GAP,
    y: NAV_TOP,
    width: width + TOGGLE_NAV_GAP,
    height: BUTTON_HEIGHT,
  };
  const fitsAtTop = !nav.some((item) => boxesOverlap(item.box, top));
  let x = left + BUTTON_PAD;
  const y = (fitsAtTop ? NAV_TOP : viewport.height - SIDE - BUTTON_HEIGHT) + BUTTON_PAD;
  return specs.map((spec, i) => {
    const item = { ...spec, ...drawButton(masks[i], x, y, spec.pressed, place) };
    x += masks[i].width + 2 * BUTTON_PAD + TOGGLE_GAP;
    return item;
  });
}

/** Draw a button with its label at (x, y): underlined if `underlined`, inside a border. Returns its box and border. */
function drawButton(
  label: CellMask,
  x: number,
  y: number,
  underlined: boolean,
  place: (mask: CellMask, x: number, y: number) => void,
): { box: Box; border: Point[] } {
  const box = {
    x: x - BUTTON_PAD,
    y: y - BUTTON_PAD,
    width: label.width + 2 * BUTTON_PAD,
    height: BUTTON_HEIGHT,
  };
  const border = edgeCells(box);
  place(label, x, y);
  if (underlined) place(underline(label.width), x, y + UNDERLINE_ROW);
  place({ ...box, cells: border }, 0, 0);
  return { box, border };
}

/** The toggle whose hit region holds `at`, if any. */
export function toggleAt(layout: SectionLayout, at: Point): ToggleItem | undefined {
  return layout.toggles.find((t) => boxContains(t.box, at));
}

/**
 * Whether the viewport is a phone held upright, which gets the phone's nav lines (see
 * `phoneLines`): a narrow viewport (one that gets the stacked name), as long as the
 * stacked name would still fit below a column of every nav item, one per line (the
 * phone's lines are never more). A short one (a phone on its side) wraps the nav into
 * rows instead. It depends on the viewport alone, so every Section has the same nav and
 * a Transition leaves it pinned.
 */
function isPhoneUpright(viewport: ViewportCells, items: number): boolean {
  return (
    nameLayoutFor(viewport) === "stacked" &&
    navRowTop(items) + TITLE_GAP + STACKED_NAME.height <= viewport.height
  );
}

function underline(width: number): CellMask {
  return { width, height: 1, cells: Array.from({ length: width }, (_, x) => ({ x, y: 0 })) };
}

/**
 * Body Text as the page CSS sets it when the Grid is on (`Base.astro` and
 * `Section.astro`; a test checks they agree): it starts `gapRem` below the title, in a
 * centred column at most `columnRem` wide with at least `gutterPx` either side, in 16px
 * type at `lineHeight`.
 */
export const BODY_TEXT_CSS = {
  gapRem: 1.25,
  columnRem: 44,
  gutterPx: 16,
  lineHeight: 1.55,
} as const;
const REM_PX = 16;
const DEFAULT_CELL_PX = 8;
const BODY_GAP_PX = BODY_TEXT_CSS.gapRem * REM_PX;
const BODY_COLUMN_PX = BODY_TEXT_CSS.columnRem * REM_PX;
const BODY_GUTTER_PX = BODY_TEXT_CSS.gutterPx;

function bodyRegion(viewport: ViewportCells, title: Box, toggles: readonly ToggleItem[]): Box {
  const cellPx = viewport.cellPx ?? DEFAULT_CELL_PX;
  const gutter = Math.max(BODY_GUTTER_PX, (viewport.width * cellPx - BODY_COLUMN_PX) / 2);
  const x = Math.min(Math.ceil(gutter / cellPx), Math.floor(viewport.width / 2));
  const y = Math.min(title.y + title.height + Math.ceil(BODY_GAP_PX / cellPx), viewport.height);
  const width = viewport.width - 2 * x;
  // Toggles below the title in the column's width would cover the text scrolling under them.
  const below = toggles
    .filter((t) => t.box.y >= y && spanOverlap(t.box.x, t.box.width, x, width) > 0)
    .map((t) => t.box.y);
  const bottom = Math.min(viewport.height, ...below);
  return { x, y, width, height: Math.max(0, bottom - y) };
}
