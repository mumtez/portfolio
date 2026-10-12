import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridRenderer, type GridReadout } from "./grid-renderer";
import { CellKind } from "./life-engine";
import { DARK, LIGHT } from "./palette";

/** Canvas2D calls that build a path: drawing cells with these costs one path per Cell. */
const PATH_CALLS = ["roundRect", "rect", "arc", "arcTo", "ellipse", "moveTo", "lineTo"];

interface FakeCanvas {
  width: number;
  height: number;
  style: Record<string, string>;
  /** Every call made on this canvas's 2D context, by method name. */
  calls: Map<string, number>;
  /** The last `fillStyle` set on this canvas's context: a sprite's colour. */
  fillStyle?: string;
  getContext(kind: "2d"): unknown;
}

/** A canvas whose 2D context counts every method call and remembers its fill colour. */
function fakeCanvas(): FakeCanvas {
  const canvas: FakeCanvas = {
    width: 0,
    height: 0,
    style: {},
    calls: new Map(),
    getContext: () => ctx,
  };
  const ctx = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        return (..._args: unknown[]) => {
          canvas.calls.set(prop, (canvas.calls.get(prop) ?? 0) + 1);
        };
      },
      set(_target, prop, value) {
        if (prop === "fillStyle") canvas.fillStyle = value;
        return true;
      },
    },
  );
  return canvas;
}

/** The sprites the renderer made, in order. */
let sprites: FakeCanvas[] = [];

beforeEach(() => {
  sprites = [];
  vi.stubGlobal("window", { devicePixelRatio: 2 });
  vi.stubGlobal("document", {
    createElement(tag: string) {
      if (tag !== "canvas") throw new Error(`unexpected <${tag}>`);
      const sprite = fakeCanvas();
      sprites.push(sprite);
      return sprite;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A Grid of `width`×`height` where every other Cell is Free and the top row is Pinned. */
function busyGrid(width: number, height: number): GridReadout {
  return {
    width,
    height,
    kindAt: (x, y) =>
      y === 0 ? CellKind.Pinned : (x + y) % 2 === 0 ? CellKind.Free : CellKind.Dead,
    ghostAt: () => 0,
  };
}

function totalCalls(canvases: FakeCanvas[], names: string[]): number {
  return canvases.reduce((sum, c) => sum + names.reduce((s, n) => s + (c.calls.get(n) ?? 0), 0), 0);
}

function setUp() {
  const canvas = fakeCanvas();
  const renderer = new GridRenderer(canvas as unknown as HTMLCanvasElement, DARK);
  return { canvas, renderer };
}

describe("GridRenderer", () => {
  it("stamps thousands of live Cells without building a path per Cell", () => {
    const { canvas, renderer } = setUp();
    const grid = busyGrid(120, 80);
    renderer.resize(grid.width, grid.height, 6);

    renderer.draw(grid);
    renderer.draw(grid);

    expect(totalCalls([canvas], PATH_CALLS)).toBe(0);
    // 120 Pinned + 79 rows × 60 Free = 4,860 live Cells per draw.
    expect(canvas.calls.get("drawImage")).toBe(2 * 4860);
    // Paths are only built once per sprite, never per Cell or per frame.
    expect(totalCalls(sprites, PATH_CALLS)).toBeLessThanOrEqual(sprites.length);
    expect(sprites.length).toBeLessThanOrEqual(2);
  });

  it("rebuilds its sprites at the new size after a resize", () => {
    const { renderer } = setUp();
    const grid = busyGrid(40, 20);
    renderer.resize(grid.width, grid.height, 6);
    renderer.draw(grid);
    const before = sprites.length;

    renderer.resize(grid.width, grid.height, 4);
    renderer.draw(grid);

    const rebuilt = sprites.slice(before);
    expect(rebuilt.length).toBeGreaterThan(0);
    // 4 CSS px at devicePixelRatio 2.
    expect(rebuilt.map((s) => s.width)).toEqual(rebuilt.map(() => 8));
  });

  it("rebuilds its sprites in the new colours after a palette change", () => {
    const { renderer } = setUp();
    const grid = busyGrid(40, 20);
    renderer.resize(grid.width, grid.height, 6);
    renderer.draw(grid);
    const before = sprites.length;

    renderer.palette = LIGHT;
    renderer.draw(grid);

    const colours = sprites.slice(before).map((s) => s.fillStyle);
    expect(colours.sort()).toEqual([LIGHT.free, LIGHT.pinned].sort());
  });
});
