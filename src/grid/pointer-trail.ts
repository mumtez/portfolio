/**
 * Pointer trail: the Cells a pointer passes over between two moves. Pure, headless.
 */
import type { Point } from "./life-engine";

/** The Cells on a straight line from `from` to `to`, both included, with no gaps. */
export function cellLine(from: Point, to: Point): Point[] {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const out: Point[] = [];
  for (let k = 0; k <= steps; k++) {
    const f = steps === 0 ? 0 : k / steps;
    out.push({ x: Math.round(from.x + (to.x - from.x) * f), y: Math.round(from.y + (to.y - from.y) * f) });
  }
  return out;
}
