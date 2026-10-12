/**
 * Measuring the page: the Section's Body Text as shapes in cells, from the DOM's own
 * line boxes. Needs real layout, so the browser tests cover it.
 */
import type { Box } from "./cell-typesetter";
import { cellBoxCovering } from "./html-regions";
import type { Shape } from "./shapes";

/**
 * Every rendered line of text in `main` that shows within `within` (cells), as a line
 * shape, and every Panel, as a Panel shape. Each text node's client rects are its line
 * fragments; fragments of one line (split by a link, say) are joined. Text hidden from
 * sight (a visually hidden heading) is left out.
 */
export function measureShapes(main: Element, cellPx: number, within: Box): Shape[] {
  const hidden = new Map<Element, boolean>();
  const isHidden = (el: Element | null): boolean => {
    if (!el || el === main) return false;
    let known = hidden.get(el);
    if (known === undefined) {
      const r = el.getBoundingClientRect();
      known = (r.width <= 1 && r.height <= 1) || isHidden(el.parentElement);
      hidden.set(el, known);
    }
    return known;
  };
  const fragments: Box[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || isHidden(node.parentElement)) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      const box = cellBoxCovering(rect, cellPx, within);
      if (box) fragments.push(box);
    }
  }
  const lineShapes: Shape[] = joinLines(fragments).map((box) => ({ kind: "line", box }));
  return [...lineShapes, ...measurePanels(main, cellPx, within, isHidden)];
}

/**
 * Every Panel in `main` (an element marked `data-panel` with its kind) that shows within
 * `within`, as a Panel shape, a Button Panel with its link's `href`: its box snapped to the nearest cell edges, so its border
 * Cells lie along its HTML box's edge, at most half a cell off (its padding hides that),
 * and clipped to what shows.
 */
function measurePanels(
  main: Element,
  cellPx: number,
  within: Box,
  isHidden: (el: Element) => boolean,
): Shape[] {
  const shapes: Shape[] = [];
  for (const el of main.querySelectorAll<HTMLElement>("[data-panel]")) {
    const panel = el.dataset.panel;
    if (panel !== "solid" && panel !== "dashed" && panel !== "button") continue;
    if (isHidden(el)) continue;
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left / cellPx);
    const y = Math.round(r.top / cellPx);
    const box = {
      x,
      y,
      width: Math.round(r.right / cellPx) - x,
      height: Math.round(r.bottom / cellPx) - y,
    };
    if (box.width < 2 || box.height < 2 || !overlapping(box, within)) continue;
    const href = panel === "button" ? el.getAttribute("href") : null;
    shapes.push({ kind: "panel", panel, box, clip: within, ...(href ? { href } : {}) });
  }
  return shapes;
}

function overlapping(a: Box, b: Box): boolean {
  return overlap(a.x, a.width, b.x, b.width) > 0 && overlap(a.y, a.height, b.y, b.height) > 0;
}

/** Join fragments on the same line (overlapping rows, at most a cell apart) into one box each. */
function joinLines(fragments: readonly Box[]): Box[] {
  const sorted = [...fragments].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Box[] = [];
  for (const f of sorted) {
    const i = lines.findIndex(
      (l) =>
        overlap(l.y, l.height, f.y, f.height) * 2 >= Math.min(l.height, f.height) &&
        f.x <= l.x + l.width + 1 &&
        l.x <= f.x + f.width + 1,
    );
    if (i < 0) {
      lines.push(f);
      continue;
    }
    const l = lines[i];
    const x = Math.min(l.x, f.x);
    const y = Math.min(l.y, f.y);
    lines[i] = {
      x,
      y,
      width: Math.max(l.x + l.width, f.x + f.width) - x,
      height: Math.max(l.y + l.height, f.y + f.height) - y,
    };
  }
  return lines;
}

function overlap(a: number, aLength: number, b: number, bLength: number): number {
  return Math.max(0, Math.min(a + aLength, b + bLength) - Math.max(a, b));
}
