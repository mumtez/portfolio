/**
 * The client Grid script: hydrates over a Section's Plain View HTML, on every Section.
 *
 * The Grid Director decides what happens; this file wires it to the window, the
 * session, the history and the renderer. Home plays the Intro on a first visit. Every
 * Section pins its heading and the nav; the nav's real `<a>` elements are laid over
 * their cells, and clicking one (or going back or forward) runs a Transition while the
 * next Section's Plain View is swapped in. That Section's Body Text stays hidden while
 * it condenses out of cells, and fades in as they're released (ADR 0004). Its Frames are
 * measured where they lie in the page and walled off in the Life Engine. Each nav item is
 * a button drawn in cells, whose border decays for a moment on hover or focus. Soup is
 * kept alive by spaceships flying in from the edges, and stirred by the pointer.
 */
import { countPageView } from "../lib/analytics";
import { cellSize } from "./cell-size";
import { navItemAt, type Box, type SectionLayout } from "./cell-typesetter";
import { GridDirector, TICK_MS, type IntroMemory } from "./grid-director";
import { GridRenderer } from "./grid-renderer";
import { cellBoxCovering } from "./html-regions";
import type { Point } from "./life-engine";
import { prefetchSection, swapToSection } from "./page-swap";
import { DARK } from "./palette";
import { cellLine } from "./pointer-trail";
import { hasSection, sectionPath, transitionPathFor, type GridContent } from "./routes";
import { maybeLaunch, spaceshipAt } from "./spaceships";
import { startTicker, type Ticker } from "./ticker";

/** Off-screen cells on every side, so patterns enter and leave naturally. Wider than any spaceship plus the dead ring. */
const MARGIN = 12;
const INTRO_SEEN_KEY = "intro-seen";
/** A pointer jump longer than this many cells starts a new trail instead of drawing a long line. */
const TRAIL_MAX_GAP = 12;
/** Clicks on these drop no glider: they're for the content, not the Grid. */
const INTERACTIVE = "a, button, input, textarea, select, label, summary, [role='button']";
/** The real links laid over buttons drawn in cells (placed by `placeHtml`). */
const DRAWN_BUTTON = "a.on-grid";

export interface GridOptions {
  readonly canvas: HTMLCanvasElement;
  /** Every Section's heading and nav label, embedded in the page from the content collections. */
  readonly content: GridContent;
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
  /** The Section whose HTML is in the page; unknown while a swap is on its way. */
  let shownRoute: string | undefined = sectionPath(window.location.pathname);
  /** The Frames last walled off, to skip setting the same ones again. */
  let framesKey = "";

  function rebuild(): void {
    cellPx = cellSize(window.innerWidth, window.devicePixelRatio || 1);
    const width = Math.ceil(window.innerWidth / cellPx);
    const height = Math.ceil(window.innerHeight / cellPx);
    director = new GridDirector({
      viewport: { width, height, cellPx },
      margin: MARGIN,
      route: window.location.pathname,
      reducedMotion,
      introMemory: sessionIntroMemory,
      content,
    });
    renderer.resize(width, height, cellPx);
    framesKey = "";
    redraw();
    placeHtml(director.layout, cellPx);
  }

  /** Draw now, and give what was drawn (a fresh Intro seed, say) a full tick on screen. */
  function redraw(): void {
    draw();
    ticker?.restart();
  }

  function draw(): void {
    renderer.draw(director.engine, syncHtml());
  }

  /**
   * Wall off the Frames of the Section on screen where they are now (they scroll with
   * the Body Text), and return where its Body Text lies over the Grid, so the cells
   * there are drawn faint: the text column, down to the end of the text.
   */
  function syncHtml(): Box {
    const { body } = director.layout;
    const main = document.querySelector("main");
    if (!main || !director.bodyTextReleased || shownRoute !== director.route) {
      setFrames([]);
      return body;
    }
    const view = { x: 0, y: 0, width: director.engine.width, height: director.engine.height };
    const scrollBox = cellBoxCovering(main.getBoundingClientRect(), cellPx, view) ?? view;
    setFrames(
      [...main.querySelectorAll(".frame-slot")].flatMap(
        (el) => cellBoxCovering(el.getBoundingClientRect(), cellPx, scrollBox) ?? [],
      ),
    );
    const textBottom = main.lastElementChild?.getBoundingClientRect().bottom ?? 0;
    const bottom = Math.min(body.y + body.height, Math.ceil(textBottom / cellPx));
    return { ...body, height: Math.max(0, bottom - body.y) };
  }

  function setFrames(frames: Box[]): void {
    const key = JSON.stringify(frames);
    if (key === framesKey) return;
    framesKey = key;
    director.setFrames(frames);
  }

  /** Fade the arriving Section's HTML in once the Director has released its Body Text. */
  function revealBodyText(): void {
    if (director.bodyTextReleased) document.querySelector("main.arriving:not(.released)")?.classList.add("released");
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
   * history entry for that URL (a link click); back and forward have already moved it.
   */
  function goTo(path: string, push?: string): void {
    if (!director.navigate(path)) return;
    shownRoute = undefined;
    if (push !== undefined) history.pushState(null, "", push);
    placeHtml(director.layout, cellPx);
    redraw();
    // If the page can't be fetched, load it the ordinary way: the URL already points at it.
    // A page load is counted by GoatCounter's script; a swap has to be counted here.
    swapToSection(path).then(
      (landed) => {
        if (!landed) return;
        shownRoute = path;
        revealBodyText();
        countPageView(path);
      },
      () => window.location.reload(),
    );
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
    // Push the Section's own URL (`/about` → `/about/`), keeping any `#` target.
    goTo(path, path + new URL(a.href).hash);
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
        if (path !== director.route && hasSection(content, path)) prefetchSection(path);
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

  // A button's border decays for a moment when the pointer moves onto it or it gets
  // keyboard focus. Which button is under the pointer comes from the Typesetter's hit
  // regions, which the real links are laid exactly over.
  for (const type of ["pointermove", "pointerdown"] as const) {
    window.addEventListener(type, (e) => director.hover(cellAt(e)), { passive: true });
  }
  document.documentElement.addEventListener("pointerleave", () => director.hover(undefined), { passive: true });
  document.addEventListener("focusin", (e) => {
    if (e.target instanceof HTMLAnchorElement && e.target.matches(DRAWN_BUTTON)) director.focus(e.target.pathname);
  });
  // Buttons are links underneath, which Enter follows; Space presses them too, like a button.
  document.addEventListener("keydown", (e) => {
    if (e.key !== " " || e.repeat || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!(e.target instanceof HTMLAnchorElement) || !e.target.matches(DRAWN_BUTTON)) return;
    e.preventDefault();
    e.target.click();
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
    revealBodyText();
    draw();
  }, TICK_MS);
}
