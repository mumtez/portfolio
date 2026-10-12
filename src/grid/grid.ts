/**
 * The client Grid script: hydrates over a Section's Plain View HTML, on every Section.
 *
 * The Grid Director decides what happens; this file wires it to the window, the
 * session, the history and the renderer. Home plays the Intro on a first visit. Every
 * Section pins its heading and the nav; the nav's real `<a>` elements are laid over
 * their cells, and clicking one (or going back or forward) runs a Transition while the
 * next Section's Plain View is swapped in. The page measures each Section's Body Text
 * into shapes in cells, its lines and its Panels (Entries, Frames, Placeholders): the old
 * Section's lines and Panel borders dissolve into Life as its HTML fades out, and the
 * next Section's stay hidden while they condense out of cells, then the text fades in as
 * its lines are released (ADR 0004) and the Panels' borders stay pinned round it, their
 * interiors walled off, following the text as it scrolls. Each nav item is
 * a button drawn in cells, whose border decays for a moment on hover or focus, and so are
 * the theme and simulation toggles in the corner and the Button Panels (a Project Entry):
 * real links in the Body Text, hit-tested on their measured box. Soup is kept alive by spaceships flying
 * in from the edges, and stirred by the pointer. Switching the simulation off stops it all
 * and leaves the Plain View.
 */
import { countPageView } from "../lib/analytics";
import type { Box } from "./box";
import { cellSize } from "./cell-size";
import { navItemAt, toggleAt, type SectionLayout, type ToggleSpec } from "./cell-typesetter";
import { GridDirector, TICK_MS, type IntroMemory } from "./grid-director";
import { GridRenderer } from "./grid-renderer";
import { cellBoxCovering } from "./html-regions";
import { measureShapes } from "./measure-shapes";
import type { Shape } from "./shapes";
import { CellKind, type Point } from "./life-engine";
import { prefetchSection, swapToSection } from "./page-swap";
import type { Palette } from "./palette";
import { cellLine } from "./pointer-trail";
import { hasSection, sectionPath, transitionPathFor, type GridContent } from "./routes";
import { maybeLaunch, spaceshipAt } from "./spaceships";
import { exposeTestHooks } from "./test-hooks";
import { startTicker, type Ticker } from "./ticker";

/** Off-screen cells on every side, so patterns enter and leave naturally. Wider than any spaceship plus the dead ring. */
const MARGIN = 12;
const INTRO_SEEN_KEY = "intro-seen";
/** A pointer jump longer than this many cells starts a new trail instead of drawing a long line. */
const TRAIL_MAX_GAP = 12;
/** Clicks on these drop no glider: they're for the content, not the Grid. */
const INTERACTIVE = "a, button, input, textarea, select, label, summary, [role='button']";
/** How long the old Section's HTML takes to fade out in a Transition (`Base.astro` fades it by `--leave-ms`). */
const LEAVE_MS = 240;
/** The real links laid over buttons drawn in cells (placed by `placeHtml`). */
const DRAWN_BUTTON = "a.on-grid";
/** The real links that are Button Panels: Body Text inside a border drawn as a Button. */
const BUTTON_PANEL = "a[data-panel='button']";
/** The real toggle buttons laid over the toggles drawn in cells, each with `data-toggle` set to its id. */
const DRAWN_TOGGLE = "button[data-toggle]";

export interface GridOptions {
  readonly canvas: HTMLCanvasElement;
  /** Every Section's heading and nav label, embedded in the page from the content collections. */
  readonly content: GridContent;
  readonly palette: Palette;
  /** The toggles to draw in the corner, each laid under the `DRAWN_TOGGLE` button with its id. */
  readonly toggles: readonly ToggleSpec[];
  readonly reducedMotion: boolean;
}

/** A running Grid. */
export interface Grid {
  /** Draw in a theme's colours from now on. */
  setPalette(palette: Palette): void;
  /** A toggle was pressed: draw the toggles as they are now. */
  setToggles(toggles: readonly ToggleSpec[]): void;
  /** Switch the simulation off: stop the Grid and leave the page as its Plain View. */
  stop(): void;
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
 * Lay the page's HTML over the cells: each top-level nav link and each toggle exactly
 * over its drawn button (so clicks, focus and screen readers use the real element), and
 * the Section's content below its pinned title, ending clear of the toggles.
 */
function placeHtml(layout: SectionLayout, cellPx: number): void {
  const px = (cells: number) => `${cells * cellPx}px`;
  const { title } = layout;
  const root = document.documentElement.style;
  // For Body Text sized in cells: a Contact link's Button is the size of its Cell label.
  root.setProperty("--cell-px", px(1));
  root.setProperty("--leave-ms", `${LEAVE_MS}ms`);
  root.setProperty("--below-title", px(title.y + title.height));
  // The Body Text ends where its region does: the bottom of the screen, or above the
  // toggles where they're in the bottom corner over its column.
  const { body } = layout;
  root.setProperty(
    "--below-body",
    `${Math.max(0, window.innerHeight - (body.y + body.height) * cellPx)}px`,
  );
  const place = (el: HTMLElement, box: Box) => {
    el.classList.add("on-grid");
    Object.assign(el.style, {
      left: px(box.x),
      top: px(box.y),
      width: px(box.width),
      height: px(box.height),
    });
  };
  for (const a of document.querySelectorAll<HTMLAnchorElement>("header nav > ul > li > a")) {
    const item = layout.nav.find((i) => i.path === sectionPath(a.pathname));
    if (item) place(a, item.box);
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(DRAWN_TOGGLE)) {
    const toggle = layout.toggles.find((t) => t.id === button.dataset.toggle);
    if (toggle) place(button, toggle.box);
  }
}

/** Undo `placeHtml`, leaving the page as its Plain View. */
function unplaceHtml(): void {
  const root = document.documentElement.style;
  root.removeProperty("--cell-px");
  root.removeProperty("--leave-ms");
  root.removeProperty("--below-title");
  root.removeProperty("--below-body");
  for (const el of document.querySelectorAll<HTMLElement>(".on-grid")) {
    el.classList.remove("on-grid");
    for (const prop of ["left", "top", "width", "height"]) el.style.removeProperty(prop);
  }
}

/** Start the Grid over the page's Plain View. */
export function startGrid({
  canvas,
  content,
  palette,
  reducedMotion,
  toggles: initialToggles,
}: GridOptions): Grid {
  let toggles = initialToggles;
  const renderer = new GridRenderer(canvas, palette);
  let director: GridDirector;
  let cellPx = 1;
  let ticker: Ticker | undefined;
  /** The Section whose HTML is in the page; unknown while a swap is on its way. */
  let shownRoute: string | undefined = sectionPath(window.location.pathname);
  /** The Body Text's shapes last handed to the Director, and their key, to skip handing over the same ones. */
  let shapes: Shape[] = [];
  let shapesKey = "";
  /** Where the last draw put the faint region under the Body Text. */
  let bodyText: Box = { x: 0, y: 0, width: 0, height: 0 };
  // Every listener goes when the Grid stops.
  const listening = new AbortController();
  const { signal } = listening;
  document.documentElement.classList.add("grid-on");

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
      toggles,
    });
    renderer.resize(width, height, cellPx);
    shapesKey = "";
    redraw();
    placeHtml(director.layout, cellPx);
  }

  /** Draw now, and give what was drawn (a fresh Intro seed, say) a full tick on screen. */
  function redraw(): void {
    draw();
    ticker?.restart();
  }

  function draw(): void {
    bodyText = syncHtml();
    renderer.draw(director.engine, bodyText);
  }

  /**
   * Measure the Section's Body Text into shapes, its lines and Panels, where it is now
   * (it scrolls), once its HTML is in the page, even while it's still hidden for a
   * Transition; and return where its Body Text lies over the Grid, so the cells there are
   * drawn faint: the text column, down to the end of the text. That's the next Section's
   * as soon as its HTML lands, hidden or not, so the faint region doesn't jump when it
   * fades in; until then, while the old Section leaves, it stays where it was.
   */
  function syncHtml(): Box {
    const { body } = director.layout;
    const main = document.querySelector("main");
    if (!main) return body;
    if (shownRoute !== director.route) return bodyText.width > 0 ? bodyText : body;
    const view = { x: 0, y: 0, width: director.engine.width, height: director.engine.height };
    const scrollBox = cellBoxCovering(main.getBoundingClientRect(), cellPx, view) ?? view;
    setShapes(measureShapes(main, cellPx, scrollBox));
    const textBottom = main.lastElementChild?.getBoundingClientRect().bottom ?? 0;
    const bottom = Math.min(body.y + body.height, Math.ceil(textBottom / cellPx));
    return { ...body, height: Math.max(0, bottom - body.y) };
  }

  function setShapes(next: Shape[]): void {
    const key = JSON.stringify(next);
    if (key === shapesKey) return;
    shapesKey = key;
    shapes = next;
    director.setShapes(next);
  }

  /** Fade the arriving Section's HTML in once the Director has released its Body Text. */
  function revealBodyText(): void {
    if (director.bodyTextReleased)
      document.querySelector("main.arriving:not(.released)")?.classList.add("released");
  }

  // A resize starts a new Director. The Intro is already marked seen, so a resize
  // mid-Intro lands on the pinned name, just like a skip.
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rebuild, 150);
    },
    { signal },
  );

  /**
   * Run a Transition to the Section at `path` and swap its Plain View in. `push` adds a
   * history entry for that URL (a link click); back and forward have already moved it.
   */
  function goTo(path: string, push?: string): void {
    if (!director.navigate(path)) return;
    shownRoute = undefined;
    // The Director has dissolved the old Section's lines; the next Section's are new.
    shapes = [];
    shapesKey = "";
    if (push !== undefined) history.pushState(null, "", push);
    placeHtml(director.layout, cellPx);
    redraw();
    // The old Section's HTML fades out over its dissolving lines before the next one
    // replaces it. If the page can't be fetched, load it the ordinary way: the URL
    // already points at it. A page load is counted by GoatCounter's script; a swap has
    // to be counted here.
    document.querySelector("main")?.classList.add("leaving");
    swapToSection(path, new Promise((done) => setTimeout(done, LEAVE_MS))).then(
      (landed) => {
        if (!landed) return;
        shownRoute = path;
        // Measure it now, so its lines start condensing on the next tick.
        draw();
        revealBodyText();
        countPageView(path);
      },
      () => window.location.reload(),
    );
  }

  // Links to other Sections run a Transition instead of a page load. They stay real
  // links: with JS off, or for new-tab clicks, the browser follows them as usual.
  document.addEventListener(
    "click",
    (e) => {
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
    },
    { signal },
  );
  window.addEventListener("popstate", () => goTo(sectionPath(window.location.pathname)), {
    signal,
  });
  // Fetch a Section's page as soon as its link is pointed at or focused.
  for (const type of ["pointerover", "focusin"] as const) {
    document.addEventListener(
      type,
      (e) => {
        const a =
          e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
        if (!a || a.origin !== window.location.origin) return;
        const path = sectionPath(a.pathname);
        if (path !== director.route && hasSection(content, path)) prefetchSection(path);
      },
      { passive: true, signal },
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
  window.addEventListener(
    "pointerdown",
    (e) => {
      const before = director.phase;
      director.input(cellAt(e));
      pressWasForIntro = before === "intro" || director.phase === "intro";
      if (pressWasForIntro) redraw();
    },
    { signal },
  );
  for (const type of ["keydown", "wheel", "scroll"] as const) {
    window.addEventListener(
      type,
      () => {
        if (director.phase !== "intro") return;
        director.input();
        redraw();
      },
      // Capture, so scrolling the Section's content (its own scroll box) counts too.
      { passive: true, capture: true, signal },
    );
  }

  // Panels scroll with the Body Text: redraw as it scrolls, so their borders and walls
  // (and the faint region) follow the text between ticks instead of trailing by up to one.
  let scrollFrame = 0;
  document.addEventListener(
    "scroll",
    () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(() => ((scrollFrame = 0), draw()));
    },
    { passive: true, capture: true, signal },
  );

  let trailEnd: Point | undefined;
  function trail(e: PointerEvent): void {
    if (director.phase === "intro") return;
    // A finger only draws while it's down; a mouse draws whenever it moves.
    if (e.pointerType !== "mouse" && e.buttons === 0) return;
    const cell = cellAt(e);
    const from =
      trailEnd &&
      Math.max(Math.abs(cell.x - trailEnd.x), Math.abs(cell.y - trailEnd.y)) <= TRAIL_MAX_GAP
        ? trailEnd
        : cell;
    director.engine.inject(cellLine(from, cell));
    trailEnd = cell;
  }
  const endTrail = () => (trailEnd = undefined);
  window.addEventListener("pointerdown", trail, { passive: true, signal });
  window.addEventListener("pointermove", trail, { passive: true, signal });
  window.addEventListener("pointerup", endTrail, { passive: true, signal });
  window.addEventListener("pointercancel", endTrail, { passive: true, signal });
  document.documentElement.addEventListener("pointerleave", endTrail, { passive: true, signal });
  window.addEventListener(
    "pointermove",
    (e) => {
      document.body.style.cursor = director.canReplayAt(cellAt(e)) ? "pointer" : "";
    },
    { signal },
  );

  // A button's border decays for a moment when the pointer moves onto it or it gets
  // keyboard focus. Which button is under the pointer comes from the Typesetter's hit
  // regions, which the real links are laid exactly over, or a Button Panel's measured box.
  for (const type of ["pointermove", "pointerdown"] as const) {
    window.addEventListener(type, (e) => director.hover(cellAt(e)), { passive: true, signal });
  }
  document.documentElement.addEventListener("pointerleave", () => director.hover(undefined), {
    passive: true,
    signal,
  });
  document.addEventListener(
    "focusin",
    (e) => {
      if (e.target instanceof HTMLAnchorElement && e.target.matches(DRAWN_BUTTON))
        director.focus(e.target.pathname);
      if (e.target instanceof HTMLAnchorElement && e.target.matches(BUTTON_PANEL)) {
        // Focus scrolls it into sight after this event: measure it there first.
        const href = e.target.getAttribute("href") ?? "";
        requestAnimationFrame(() => {
          if (signal.aborted) return;
          draw();
          director.focusPanel(href);
        });
      }
      if (e.target instanceof HTMLButtonElement && e.target.matches(DRAWN_TOGGLE)) {
        director.focusToggle(e.target.dataset.toggle ?? "");
      }
    },
    { signal },
  );
  // Buttons are links underneath, which Enter follows; Space presses them too, like a button.
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        e.key !== " " ||
        e.repeat ||
        e.defaultPrevented ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey
      )
        return;
      if (
        !(e.target instanceof HTMLAnchorElement) ||
        !e.target.matches(`${DRAWN_BUTTON}, ${BUTTON_PANEL}`)
      )
        return;
      e.preventDefault();
      e.target.click();
    },
    { signal },
  );

  window.addEventListener(
    "click",
    (e) => {
      if (pressWasForIntro || director.phase === "intro") return;
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      if (!window.getSelection()?.isCollapsed) return;
      const at = cellAt(e);
      const engine = director.engine;
      if (
        engine.isPinned(at.x, at.y) ||
        navItemAt(director.layout, at) ||
        toggleAt(director.layout, at)
      )
        return;
      engine.inject(spaceshipAt("glider", at));
    },
    { signal },
  );

  const hideTestHooks = exposeTestHooks({
    shapes: () => ({ cellPx, shapes }),
    bodyText: () => bodyText,
    cell: (x, y) => ({
      pinned: director.engine.isPinned(x, y),
      wall: director.engine.kindAt(x, y) === CellKind.Wall,
    }),
  });

  rebuild();
  ticker = startTicker(() => {
    if (director.phase !== "intro") maybeLaunch(director.engine);
    director.tick();
    revealBodyText();
    draw();
  }, TICK_MS);

  return {
    setPalette(next) {
      renderer.palette = next;
      draw();
    },
    setToggles(next) {
      toggles = next;
      director.setToggles(next);
      draw();
    },
    stop() {
      listening.abort();
      ticker?.stop();
      clearTimeout(resizeTimer);
      cancelAnimationFrame(scrollFrame);
      hideTestHooks();
      unplaceHtml();
      document.body.style.cursor = "";
      document.documentElement.classList.remove("grid-on");
    },
  };
}
