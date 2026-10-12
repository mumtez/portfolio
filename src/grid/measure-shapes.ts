/**
 * Measuring the page: the Section's Body Text as shapes in cells, from the DOM's own
 * line boxes. Needs real layout, so the browser tests cover it.
 */
import type { Box } from "./cell-typesetter";
import { cellBoxCovering } from "./html-regions";
import type { Shape } from "./shapes";

/**
 * Every rendered line of text in `main` that shows within `within` (cells), as a line
 * shape. Each text node's client rects are its line fragments; fragments of one line
 * (split by a link, say) are joined. Text hidden from sight (a visually hidden heading)
 * is left out.
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
  return joinLines(fragments).map((box) => ({ kind: "line", box }));
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
