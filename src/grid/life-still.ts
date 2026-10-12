/**
 * Life still: a frozen Life pattern drawn faintly behind the Plain View, so the page
 * still hints at the Grid when the simulation is off. One snapshot, never stepped.
 */
import { cellSize } from "./cell-size";
import { GridRenderer } from "./grid-renderer";
import { soupCells } from "./intro-seeds";
import { LifeEngine } from "./life-engine";
import { BODY_TEXT_CELL_ALPHA, type Palette } from "./palette";

/** Generations the soup runs before it's frozen: long enough to settle into Life's shapes. */
const GENERATIONS = 60;
const DENSITY = 0.3;
/** Fixed, so the same viewport always gets the same pattern. */
const SEED = 0x5eed;
const MARGIN = 8;

/** The frozen pattern for a viewport `width`×`height` cells. */
export function lifeStill({ width, height }: { width: number; height: number }): LifeEngine {
  let state = SEED;
  const random = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 0x100000000;
  const engine = new LifeEngine({ width, height, margin: MARGIN });
  const area = { x: -MARGIN, y: -MARGIN, width: width + 2 * MARGIN, height: height + 2 * MARGIN };
  engine.inject(soupCells({ area, density: DENSITY, random }));
  for (let i = 0; i < GENERATIONS; i++) engine.step();
  return engine;
}

export interface LifeStill {
  setPalette(palette: Palette): void;
  stop(): void;
}

/**
 * Draw the still on `canvas` behind the Plain View, at the Grid's cell size and as faint
 * as the Cells under Body Text (so text keeps its contrast), redrawn on resize.
 */
export function showLifeStill(canvas: HTMLCanvasElement, palette: Palette): LifeStill {
  const renderer = new GridRenderer(canvas, palette);
  const root = document.documentElement;
  let still: LifeEngine;

  function draw(): void {
    const cellPx = cellSize(window.innerWidth, window.devicePixelRatio || 1);
    const width = Math.ceil(window.innerWidth / cellPx);
    const height = Math.ceil(window.innerHeight / cellPx);
    still = lifeStill({ width, height });
    renderer.resize(width, height, cellPx);
    renderer.draw(still);
  }

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(draw, 150);
  };

  canvas.style.opacity = String(BODY_TEXT_CELL_ALPHA);
  root.classList.add("life-still");
  window.addEventListener("resize", onResize);
  draw();

  return {
    setPalette(next) {
      renderer.palette = next;
      renderer.draw(still);
    },
    stop() {
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      root.classList.remove("life-still");
      canvas.style.opacity = "";
    },
  };
}
