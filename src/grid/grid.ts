/**
 * The client Grid script: hydrates over a Section's Plain View HTML, on every Section.
 *
 * The Grid Director decides what happens; this file wires it to the window, the
 * session, the history and the renderer. Home plays the Intro on a first visit. Every
 * Section pins its heading and the nav; the nav's real `<a>` elements are laid over
 * their cells, and clicking one (or going back or forward) runs a Transition while the
 * next Section's Plain View is swapped in. Soup is kept alive by spaceships flying in
 * from the edges, and stirred by the pointer.
 */
import { navItemAt, type SectionLayout } from "./cell-typesetter";
import { GridDirector, TICK_MS, type IntroMemory } from "./grid-director";
import { GridRenderer } from "./grid-renderer";
import type { Point } from "./life-engine";
import { prefetchSection, swapToSection } from "./page-swap";
import { DARK } from "./palette";
import { cellLine } from "./pointer-trail";
import { sectionPath, transitionPathFor, type GridContent } from "./routes";
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
  /** Every Section's heading and nav label, embedded in the page from the content collections. */
  readonly content: GridContent;
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

/**
 * Lay the page's HTML over the cells: each top-level nav link exactly over its drawn
 * label (so clicks, focus and screen readers use the real link), and the Section's
 * content just below its pinned title.
 */
function placeHtml(layout: SectionLayout, cellPx: number): void {
  const px = (cells: number) => `${cells * cellPx}px`;
  const { title } = layout;
  document.documentElement.style.setProperty("--below-title", px(title.y + title.height));
  for (const a of document.querySelectorAll<HTMLAnchorElement>("header nav > ul > li > a")) {
    const item = layout.nav.find((i) => i.path === sectionPath(a.pathname));
    if (!item) continue;
    a.classList.add("on-grid");
    Object.assign(a.style, {
      left: px(item.box.x),
      top: px(item.box.y),
      width: px(item.box.width),
      height: px(item.box.height),
    });
  }
}

export function startGrid({ canvas, content }: GridOptions): void {
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
      content,
    });
    renderer.resize(width, height, cellPx);
    redraw();
    placeHtml(director.layout, cellPx);
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

  /**
   * Run a Transition to the Section at `path` and swap its Plain View in. `push` adds a
   * history entry for `href` (a link click); back and forward have already moved the URL.
   */
  function goTo(path: string, push?: string): void {
    if (!director.navigate(path)) return;
    if (push !== undefined) history.pushState(null, "", push);
    placeHtml(director.layout, cellPx);
    redraw();
    // If the page can't be fetched, load it the ordinary way: the URL already points at it.
    swapToSection(path).catch(() => window.location.reload());
  }

  // Links to other Sections run a Transition instead of a page load. They stay real
  // links: with JS off, or for new-tab clicks, the browser follows them as usual.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || !(e.target instanceof Element)) return;
    const a = e.target.closest<HTMLAnchorElement>("a[href]");
    if (!a) return;
    const path = transitionPathFor(
      {
        href: a.getAttribute("href") ?? "",
        target: a.target,
        download: a.hasAttribute("download"),
        button: e.button,
        modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
      },
      new URL(window.location.href),
      content,
    );
    if (!path) return;
    e.preventDefault();
    goTo(path, a.href);
  });
  window.addEventListener("popstate", () => goTo(sectionPath(window.location.pathname)));
  // Fetch a Section's page as soon as its link is pointed at or focused.
  for (const type of ["pointerover", "focusin"] as const) {
    document.addEventListener(
      type,
      (e) => {
        const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
        if (!a || a.origin !== window.location.origin) return;
        const path = sectionPath(a.pathname);
        if (path !== director.route && content.sections.some((s) => s.path === path)) prefetchSection(path);
      },
      { passive: true },
    );
  }

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
      // Capture, so scrolling the Section's content (its own scroll box) counts too.
      { passive: true, capture: true },
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
    if (engine.isPinned(at.x, at.y) || navItemAt(director.layout, at)) return;
    engine.inject(spaceshipAt("glider", at));
  });

  rebuild();
  ticker = startTicker(() => {
    if (director.phase !== "intro") maybeLaunch(director.engine);
    director.tick();
    renderer.draw(director.engine);
  }, TICK_MS);
}
