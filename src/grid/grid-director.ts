/**
 * Grid Director: sequences what the Grid is doing and drives the Life Engine. Headless.
 *
 * Phases: Intro → Settled ⇄ Transition. On a first visit to Home the Intro plays a
 * random Intro Seed under strict Life, then pins the name. A Transition releases the
 * current Section's pins into Free Cells and pins the next Section in while real Life
 * runs. (Paused is the Ticker's job, and Off is the Plain View with no Grid at all.)
 */
import { boxContains, typesetSection, type Box, type SectionLayout, type ViewportCells } from "./cell-typesetter";
import { INTRO_SEEDS, introCells, seedDensity, soupCells, type IntroSeed } from "./intro-seeds";
import { LifeEngine, type Point } from "./life-engine";
import { sectionPath, type GridContent } from "./routes";

/** One generation every this many milliseconds, during the Intro and after it. */
export const TICK_MS = 120;
/** Generations a Transition takes to pin the next Section in: 5 × 120ms = 600ms. */
export const TRANSITION_TICKS = 5;
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

  /** Advance one generation. */
  tick(): void {
    this._engine.step();
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
    const next = new Set(this._layout.pinned.map(key));
    const now = new Set(this.pinnedNow.map(key));
    this.kept = this.pinnedNow.filter((p) => next.has(key(p)));
    this.arriving = shuffle(
      this._layout.pinned.filter((p) => !now.has(key(p))),
      this.random,
    );
    this._phase = "transition";
    this.transitionTick = 0;
    this.pinArriving(0);
    return true;
  }

  /** Pin the share of the arriving pins due after `tick` generations of the Transition. */
  private pinArriving(tick: number): void {
    if (tick >= TRANSITION_TICKS) {
      this.pinLayout();
      return;
    }
    const count = Math.ceil((this.arriving.length * tick) / TRANSITION_TICKS);
    this.setPinned([...this.kept, ...this.arriving.slice(0, count)]);
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

  private setPinned(points: readonly Point[]): void {
    this._engine.setPinned(points);
    this.pinnedNow = points;
  }

  private typeset(route: string): SectionLayout {
    return typesetSection(this.options.viewport, this.options.content, route);
  }

  /** Start over with an empty Life Engine; returns the whole Grid's area, margin included. */
  private resetEngine(): Box {
    const { viewport, margin } = this.options;
    this._engine = new LifeEngine({ width: viewport.width, height: viewport.height, margin });
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
