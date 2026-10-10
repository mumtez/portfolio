/**
 * The client Grid script: hydrates over a Section's Plain View HTML.
 *
 * For now this runs Home only: the Intro (on a first visit), then soup around the
 * pinned name. The Grid Director decides what happens; this file wires it to the
 * window, the session and the renderer.
 */
import type { Box } from "./cell-typesetter";
import { GridDirector, TICK_MS, type IntroMemory } from "./grid-director";
import { GridRenderer } from "./grid-renderer";
import type { Point } from "./life-engine";
import { DARK } from "./palette";

/** Off-screen cells on every side, so patterns enter and leave naturally. */
const MARGIN = 12;
/** Cells are sized so the viewport is at least this many cells wide: the one-line name (135) plus room. */
const MIN_VIEWPORT_CELLS = 150;
const INTRO_SEEN_KEY = "intro-seen";

export interface GridOptions {
  readonly canvas: HTMLCanvasElement;
  /** Called with the name's box, in CSS pixels, whenever the layout changes. */
  readonly onLayout?: (name: Box) => void;
}

function cellSize(viewportPx: number): number {
  return Math.min(8, Math.max(2, Math.floor(viewportPx / MIN_VIEWPORT_CELLS)));
}

/** The Intro plays once per browser session. If storage fails, the Intro may just play again. */
const sessionIntroMemory: IntroMemory = {
  hasSeen() {
    try {
      return sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
    } catch {
      return false;
    }
  },
  markSeen() {
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // Private mode or blocked storage: nowhere to remember it.
    }
  },
};

export function startGrid({ canvas, onLayout }: GridOptions): void {
  const renderer = new GridRenderer(canvas, DARK);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let director: GridDirector;
  let cellPx = 1;
  /** When the last tick ran. Reset on every redraw so a fresh Intro seed shows for a full tick. */
  let last = 0;

  function rebuild(): void {
    cellPx = cellSize(window.innerWidth);
    const width = Math.ceil(window.innerWidth / cellPx);
    const height = Math.ceil(window.innerHeight / cellPx);
    director = new GridDirector({
      viewport: { width, height },
      margin: MARGIN,
      route: window.location.pathname,
      reducedMotion,
      introMemory: sessionIntroMemory,
    });
    renderer.resize(width, height, cellPx);
    redraw();
    const { x, y, width: w, height: h } = director.home.name;
    onLayout?.({ x: x * cellPx, y: y * cellPx, width: w * cellPx, height: h * cellPx });
  }

  function redraw(): void {
    renderer.draw(director.engine);
    last = performance.now();
  }

  // A resize starts a new Director. The Intro is already marked seen, so a resize
  // mid-Intro lands on the pinned name, just like a skip.
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 150);
  });

  // Any click, tap, key or scroll skips the Intro; a click or tap on the name replays it.
  const cellAt = (e: PointerEvent): Point => ({ x: Math.floor(e.clientX / cellPx), y: Math.floor(e.clientY / cellPx) });
  window.addEventListener("pointerdown", (e) => {
    const before = director.phase;
    director.input(cellAt(e));
    if (before === "intro" || director.phase === "intro") redraw();
  });
  for (const type of ["keydown", "wheel", "scroll"] as const) {
    window.addEventListener(
      type,
      () => {
        if (director.phase !== "intro") return;
        director.input();
        redraw();
      },
      { passive: true },
    );
  }
  window.addEventListener("pointermove", (e) => {
    document.body.style.cursor = director.canReplayAt(cellAt(e)) ? "pointer" : "";
  });

  function frame(t: number): void {
    requestAnimationFrame(frame);
    if (t - last < TICK_MS) return;
    last = t;
    director.tick();
    renderer.draw(director.engine);
  }

  rebuild();
  requestAnimationFrame(frame);
}
