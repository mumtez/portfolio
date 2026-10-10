/**
 * The client Grid script: hydrates over a Section's Plain View HTML.
 *
 * For now this runs Home only: the Intro (on a first visit), then soup around the
 * pinned name, kept alive by spaceships flying in from the edges, and stirred by the
 * pointer. The Grid Director decides what happens; this file wires it to the window,
 * the session and the renderer.
 */
import type { Box } from "./cell-typesetter";
import { GridDirector, TICK_MS, type IntroMemory } from "./grid-director";
import { GridRenderer } from "./grid-renderer";
import type { Point } from "./life-engine";
import { DARK } from "./palette";
import { cellLine } from "./pointer-trail";
import { maybeLaunch, spaceshipAt } from "./spaceships";
import { startTicker, type Ticker } from "./ticker";

/** Off-screen cells on every side, so patterns enter and leave naturally. Wider than any spaceship plus the dead ring. */
const MARGIN = 12;
/** Cells are sized so the viewport is at least this many cells wide: the one-line name (135) plus room. */
const MIN_VIEWPORT_CELLS = 150;
const INTRO_SEEN_KEY = "intro-seen";
/** A pointer jump longer than this many cells starts a new trail instead of drawing a long line. */
const TRAIL_MAX_GAP = 12;
/** Clicks on these drop no glider: they're for the content, not the Grid. */
const INTERACTIVE = "a, button, input, textarea, select, label, summary, [role='button']";

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
  let ticker: Ticker | undefined;

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

  /** Draw now, and give what was drawn (a fresh Intro seed, say) a full tick on screen. */
  function redraw(): void {
    renderer.draw(director.engine);
    ticker?.restart();
  }

  // A resize starts a new Director. The Intro is already marked seen, so a resize
  // mid-Intro lands on the pinned name, just like a skip.
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 150);
  });

  // Listeners are on the window and passive, and the canvas keeps the default
  // touch-action, so dragging a finger still scrolls.
  const cellAt = (e: PointerEvent | MouseEvent): Point => ({
    x: Math.floor(e.clientX / cellPx),
    y: Math.floor(e.clientY / cellPx),
  });

  // Any click, tap, key or scroll skips the Intro; a click or tap on the name replays it.
  // The Intro is strict Life, so nothing else touches the Grid while it plays, and a
  // press that skipped or replayed it drops no glider.
  let pressWasForIntro = false;
  window.addEventListener("pointerdown", (e) => {
    const before = director.phase;
    director.input(cellAt(e));
    pressWasForIntro = before === "intro" || director.phase === "intro";
    if (pressWasForIntro) redraw();
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

  let trailEnd: Point | undefined;
  function trail(e: PointerEvent): void {
    if (director.phase === "intro") return;
    // A finger only draws while it's down; a mouse draws whenever it moves.
    if (e.pointerType !== "mouse" && e.buttons === 0) return;
    const cell = cellAt(e);
    const from =
      trailEnd && Math.max(Math.abs(cell.x - trailEnd.x), Math.abs(cell.y - trailEnd.y)) <= TRAIL_MAX_GAP
        ? trailEnd
        : cell;
    director.engine.inject(cellLine(from, cell));
    trailEnd = cell;
  }
  const endTrail = () => (trailEnd = undefined);
  window.addEventListener("pointerdown", trail, { passive: true });
  window.addEventListener("pointermove", trail, { passive: true });
  window.addEventListener("pointerup", endTrail, { passive: true });
  window.addEventListener("pointercancel", endTrail, { passive: true });
  document.documentElement.addEventListener("pointerleave", endTrail, { passive: true });
  window.addEventListener("pointermove", (e) => {
    document.body.style.cursor = director.canReplayAt(cellAt(e)) ? "pointer" : "";
  });

  window.addEventListener("click", (e) => {
    if (pressWasForIntro || director.phase === "intro") return;
    if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
    if (!window.getSelection()?.isCollapsed) return;
    const at = cellAt(e);
    const engine = director.engine;
    if (engine.isPinned(at.x, at.y)) return;
    engine.inject(spaceshipAt("glider", at));
  });

  rebuild();
  ticker = startTicker(() => {
    if (director.phase !== "intro") maybeLaunch(director.engine);
    director.tick();
    renderer.draw(director.engine);
  }, TICK_MS);
}
