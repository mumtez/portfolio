/**
 * The client Grid script: hydrates over a Section's Plain View HTML.
 *
 * For now this runs Home only: random soup around the pinned name.
 */
import { typesetHome, type Box } from "./cell-typesetter";
import { GridRenderer } from "./grid-renderer";
import { LifeEngine, type Point } from "./life-engine";
import { DARK } from "./palette";

const TICK_MS = 120;
/** Off-screen cells on every side, so patterns enter and leave naturally. */
const MARGIN = 12;
/** Chance that a Cell starts alive in the initial soup. */
const SOUP_DENSITY = 0.09;
/** Cells are sized so the viewport is at least this many cells wide: the one-line name (135) plus room. */
const MIN_VIEWPORT_CELLS = 150;

export interface GridOptions {
  readonly canvas: HTMLCanvasElement;
  /** Called with the name's box, in CSS pixels, whenever the layout changes. */
  readonly onLayout?: (name: Box) => void;
}

function cellSize(viewportPx: number): number {
  return Math.min(8, Math.max(2, Math.floor(viewportPx / MIN_VIEWPORT_CELLS)));
}

function* soup(engine: LifeEngine, density: number): Generator<Point> {
  const m = engine.margin;
  for (let y = -m; y < engine.height + m; y++) {
    for (let x = -m; x < engine.width + m; x++) {
      if (Math.random() < density) yield { x, y };
    }
  }
}

export function startGrid({ canvas, onLayout }: GridOptions): void {
  const renderer = new GridRenderer(canvas, DARK);
  let engine: LifeEngine;

  function build(): void {
    const cs = cellSize(window.innerWidth);
    const width = Math.ceil(window.innerWidth / cs);
    const height = Math.ceil(window.innerHeight / cs);
    engine = new LifeEngine({ width, height, margin: MARGIN });
    const home = typesetHome({ width, height });
    engine.inject(soup(engine, SOUP_DENSITY));
    engine.setPinned(home.pinned);
    renderer.resize(width, height, cs);
    renderer.draw(engine);
    const { x, y, width: w, height: h } = home.name;
    onLayout?.({ x: x * cs, y: y * cs, width: w * cs, height: h * cs });
  }

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  });

  let last = 0;
  function frame(t: number): void {
    requestAnimationFrame(frame);
    if (t - last < TICK_MS) return;
    last = t;
    engine.step();
    renderer.draw(engine);
  }

  build();
  requestAnimationFrame(frame);
}
