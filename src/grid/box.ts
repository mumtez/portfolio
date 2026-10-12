/**
 * Boxes of Cells: the one place their geometry lives. Pure.
 */
import type { Point } from "./life-engine";

/** A rectangle of Cells: `width` across and `height` down from its top-left Cell at (x, y). */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Whether `box` holds the Cell at `p`. */
export function boxContains(box: Box, { x, y }: Point): boolean {
  return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
}

/** Whether two boxes share any Cell. */
export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    spanOverlap(a.x, a.width, b.x, b.width) > 0 && spanOverlap(a.y, a.height, b.y, b.height) > 0
  );
}

/** The part of `a` inside `b` (empty when they don't meet). */
export function intersection(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}

/** How long the stretch shared by two spans is, from `a` for `aLength` and from `b` for `bLength`. */
export function spanOverlap(a: number, aLength: number, b: number, bLength: number): number {
  return Math.max(0, Math.min(a + aLength, b + bLength) - Math.max(a, b));
}

/**
 * The Cells on the edge of `box`, each once, in order going round it clockwise from its
 * top-left corner (every Cell of a box two or fewer across or down).
 */
export function edgeCells({ x, y, width, height }: Box): Point[] {
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
