/**
 * Grid Director: sequences what the Grid is doing and drives the Life Engine. Headless.
 *
 * Phases: Intro → Settled ⇄ Transition. On a first visit to Home the Intro plays a
 * random Intro Seed under strict Life, then pins the name. A Transition releases the
 * current Section's pins into Free Cells and pins the next Section in while real Life
 * runs, while the next Section's Body Text condenses out of Cells in its region; when
 * the Transition settles, that condensate is released into Life as the Body Text's HTML
 * fades in (ADR 0004). (Paused is the Ticker's job, and Off is the Plain View with no
 * Grid at all.)
 *
 * Frames are walls in the Life Engine. Their media are real HTML that scrolls with the
 * Body Text, so the page measures them and hands them over with `setFrames`.
 */
import {
  bodyTextCondensate,
  boxContains,
  navItemAt,
  typesetSection,
  type Box,
  type SectionLayout,
  type ViewportCells,
} from "./cell-typesetter";
import { INTRO_SEEDS, introCells, seedDensity, soupCells, type IntroSeed } from "./intro-seeds";
import { LifeEngine, type Point } from "./life-engine";
import { sectionPath, type GridContent } from "./routes";

/** One generation every this many milliseconds, during the Intro and after it. */
export const TICK_MS = 120;
/**
 * Generations a Transition takes: 5 × 120ms = 600ms. The next Section's pins and its
 * Body Text's condensate are all in by the last of them, which releases the condensate.
 */
export const TRANSITION_TICKS = 5;
/** Generations a button's border stays unpinned after a hover or focus, decaying under real Life: 360ms. */
export const BORDER_UNPIN_TICKS = 3;
/** Chance that a Cell starts alive in the ambient soup when there is no Intro. */
const AMBIENT_DENSITY = 0.09;

export type DirectorPhase = "intro" | "settled" | "transition";

/** Whether this browser session has already seen the Intro. */
export interface IntroMemory {
  hasSeen(): boolean;
  markSeen(): void;
}

export interface GridDirectorOptions {
  readonly viewport: ViewportCells;
  /** Off-screen cells on every side, passed to the Life Engine. */
  readonly margin: number;
  /** The current URL path. Only Home plays the Intro. */
  readonly route: string;
  readonly reducedMotion: boolean;
  readonly introMemory: IntroMemory;
  /** Every Section's heading and nav label, from the same content as the Plain View. */
  readonly content: GridContent;
  readonly random?: () => number;
}

const key = (p: Point) => `${p.x},${p.y}`;

export class GridDirector {
  private _layout!: SectionLayout;
  private _route: string;
  private _engine!: LifeEngine;
  private _phase: DirectorPhase = "settled";
  /** Strict generations left before the Intro's seed becomes the name; 0 once settled. */
  private ticksUntilName = 0;
  /** What is pinned right now; during a Transition, part of the way to `_layout.pinned`. */
  private pinnedNow: readonly Point[] = [];
  /** During a Transition: pins kept from the last Section, and the next Section's pins still to come, in order. */
  private kept: readonly Point[] = [];
  private arriving: readonly Point[] = [];
  private transitionTick = 0;
  /** Buttons whose border is unpinned for now, by path, with the generations left before it pins again. */
  private readonly unpinnedBorders = new Map<string, number>();
  /** The button under the pointer, so moving within it doesn't start its border over. */
  private hovered: string | undefined;
  /** Wall Cells for the Frames on screen. */
  private walls: readonly Point[] = [];
  private readonly random: () => number;

  constructor(private readonly options: GridDirectorOptions) {
    this.random = options.random ?? Math.random;
    this._route = sectionPath(options.route);
    this._layout = this.typeset(this._route);
    const { reducedMotion, introMemory } = options;
    if (this._route === "/" && !reducedMotion && !introMemory.hasSeen()) this.playIntro();
    else this.settle();
  }

  get engine(): LifeEngine {
    return this._engine;
  }

  get phase(): DirectorPhase {
    return this._phase;
  }

  /** The Section on screen, or arriving during a Transition, as a normalised path (`/about/`). */
  get route(): string {
    return this._route;
  }

  /** What the Section on screen (or arriving) pins: its title, its nav and their hit regions. */
  get layout(): SectionLayout {
    return this._layout;
  }

  /**
   * False while a Transition condenses the arriving Section's Body Text out of Cells;
   * true once it's released into Life, when the page should fade the HTML in.
   */
  get bodyTextReleased(): boolean {
    return this._phase !== "transition";
  }

  /** Wall off the Frames on screen (boxes in viewport cells), replacing any before. */
  setFrames(frames: readonly Box[]): void {
    this.walls = frames.flatMap(boxCells);
    this._engine.setWalls(this.walls);
  }

  /** Advance one generation. */
  tick(): void {
    this._engine.step();
    this.countDownBorders();
    if (this._phase === "intro" && --this.ticksUntilName === 0) this.pinLayout();
    else if (this._phase === "transition") this.pinArriving(++this.transitionTick);
  }

  /**
   * Any user input: a click, tap, key or scroll. During the Intro it skips straight
   * to the pinned name; once settled, a click or tap on the name replays the Intro.
   */
  input(at?: Point): void {
    if (this._phase === "intro") this.skipIntro();
    else if (at && this.canReplayAt(at)) this.playIntro();
  }

  /**
   * The pointer is at `at` (undefined once it leaves the page). Moving onto a button
   * unpins its border for a moment, so it starts to decay under real Life.
   */
  hover(at: Point | undefined): void {
    const path = at && navItemAt(this._layout, at)?.path;
    if (path && path !== this.hovered) this.unpinBorder(path);
    this.hovered = path;
  }

  /** The button for the Section at `path` has keyboard focus: its border decays as on hover. */
  focus(path: string): void {
    this.unpinBorder(sectionPath(path));
  }

  /** Whether a click or tap at `at` would replay the Intro (it's on Home's settled name). */
  canReplayAt(at: Point): boolean {
    return (
      this._phase === "settled" &&
      this._layout.nameLayout !== undefined &&
      !this.options.reducedMotion &&
      boxContains(this._layout.title, at)
    );
  }

  /**
   * Start a Transition to the Section at `path`: the pins that the next Section doesn't
   * share are released into Free Cells at once, and the next Section's pins come in over
   * `TRANSITION_TICKS` generations of real Life. Returns false if `path` is already showing.
   */
  navigate(path: string): boolean {
    const route = sectionPath(path);
    if (route === this._route) return false;
    if (this._phase === "intro") this.skipIntro();

    this._route = route;
    this._layout = this.typeset(route);
    // Its Frames come with its HTML; the page sets them once that's in.
    this.setFrames([]);
    const condensate = bodyTextCondensate(this._layout.body, this.options.viewport, this.random);
    const target = [...this._layout.pinned, ...condensate];
    const next = new Set(target.map(key));
    const now = new Set(this.pinnedNow.map(key));
    this.kept = this.pinnedNow.filter((p) => next.has(key(p)));
    this.arriving = shuffle(
      target.filter((p) => !now.has(key(p))),
      this.random,
    );
    this._phase = "transition";
    this.transitionTick = 0;
    this.pinArriving(0);
    return true;
  }

  /**
   * Pin the share of the arriving pins due after `tick` generations of the Transition:
   * all of them on the generation before the last, which then settles, releasing the
   * condensate.
   */
  private pinArriving(tick: number): void {
    if (tick >= TRANSITION_TICKS) {
      this.pinLayout();
      return;
    }
    const count = Math.ceil((this.arriving.length * tick) / (TRANSITION_TICKS - 1));
    this.setPinned([...this.kept, ...this.arriving.slice(0, count)]);
  }

  /**
   * Release a button's border into Free Cells for `BORDER_UNPIN_TICKS` generations. Not
   * during the Intro, which is strict Life, nor under reduced motion; and a border
   * already decaying runs its course rather than starting over.
   */
  private unpinBorder(path: string): void {
    if (this._phase === "intro" || this.options.reducedMotion || this.unpinnedBorders.has(path)) return;
    if (!this._layout.nav.some((i) => i.path === path)) return;
    this.unpinnedBorders.set(path, BORDER_UNPIN_TICKS);
    this.setPinned(this.pinnedNow);
  }

  /** One generation has passed: pin again the borders whose time is up. */
  private countDownBorders(): void {
    let due = false;
    for (const [path, left] of this.unpinnedBorders) {
      if (left > 1) this.unpinnedBorders.set(path, left - 1);
      else due = this.unpinnedBorders.delete(path);
    }
    if (due) this.setPinned(this.pinnedNow);
  }

  private skipIntro(): void {
    while (this.ticksUntilName > 0) this.tick();
  }

  private playIntro(): void {
    const { nameLayout, title } = this._layout;
    if (!nameLayout) return;
    const pool = INTRO_SEEDS[nameLayout];
    const seed: IntroSeed = pool.seeds[Math.floor(this.random() * pool.seeds.length)];
    const area = this.resetEngine();
    // Soup as dense as the seed itself, so the seed's box doesn't show as an edge.
    this._engine.inject(introCells(seed, title, { area, density: seedDensity(seed), random: this.random }));
    this.pinnedNow = [];
    this.unpinnedBorders.clear();
    this.ticksUntilName = pool.depth;
    this._phase = "intro";
    this.options.introMemory.markSeen();
  }

  private settle(): void {
    const area = this.resetEngine();
    this._engine.inject(soupCells({ area, density: AMBIENT_DENSITY, random: this.random }));
    this.pinLayout();
  }

  /** Pin exactly the current layout and settle. */
  private pinLayout(): void {
    this.setPinned(this._layout.pinned);
    this.ticksUntilName = 0;
    this.kept = [];
    this.arriving = [];
    this._phase = "settled";
  }

  /** Pin `points`, less the borders of buttons that are decaying for now. */
  private setPinned(points: readonly Point[]): void {
    this.pinnedNow = points;
    const decaying = new Set(
      this._layout.nav.filter((i) => this.unpinnedBorders.has(i.path)).flatMap((i) => i.border.map(key)),
    );
    this._engine.setPinned(decaying.size ? points.filter((p) => !decaying.has(key(p))) : points);
  }

  private typeset(route: string): SectionLayout {
    return typesetSection(this.options.viewport, this.options.content, route);
  }

  /** Start over with an empty Life Engine; returns the whole Grid's area, margin included. */
  private resetEngine(): Box {
    const { viewport, margin } = this.options;
    this._engine = new LifeEngine({ width: viewport.width, height: viewport.height, margin });
    this._engine.setWalls(this.walls);
    return { x: -margin, y: -margin, width: viewport.width + 2 * margin, height: viewport.height + 2 * margin };
  }
}

/** A shuffled copy of `items` (Fisher–Yates), so the next Section condenses in scattered cells. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Every Cell in a box. */
function boxCells({ x, y, width, height }: Box): Point[] {
  const out: Point[] = [];
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) out.push({ x: x + dx, y: y + dy });
  return out;
}
