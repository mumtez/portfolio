/**
 * Grid Director: sequences what the Grid is doing and drives the Life Engine. Headless.
 *
 * For now it handles Home's phases, Intro → Settled. On a first visit to Home the
 * Intro plays a random Intro Seed under strict Life, then pins the name.
 */
import { boxContains, typesetHome, type Box, type HomeLayout, type ViewportCells } from "./cell-typesetter";
import { INTRO_SEEDS, introCells, seedDensity, soupCells, type IntroSeed } from "./intro-seeds";
import { LifeEngine, type Point } from "./life-engine";

/** One generation every this many milliseconds, during the Intro and after it. */
export const TICK_MS = 120;
/** Chance that a Cell starts alive in the ambient soup when there is no Intro. */
const AMBIENT_DENSITY = 0.09;

export type DirectorPhase = "intro" | "settled";

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
  readonly random?: () => number;
}

function isHome(route: string): boolean {
  return route === "/" || route === "" || route === "/index.html";
}

export class GridDirector {
  readonly home: HomeLayout;
  private _engine!: LifeEngine;
  private _phase: DirectorPhase = "settled";
  /** Strict generations left before the Intro's seed becomes the name; 0 once settled. */
  private ticksUntilName = 0;
  private readonly random: () => number;

  constructor(private readonly options: GridDirectorOptions) {
    this.random = options.random ?? Math.random;
    this.home = typesetHome(options.viewport);
    const { route, reducedMotion, introMemory } = options;
    if (isHome(route) && !reducedMotion && !introMemory.hasSeen()) this.playIntro();
    else this.settle();
  }

  get engine(): LifeEngine {
    return this._engine;
  }

  get phase(): DirectorPhase {
    return this._phase;
  }

  /** Advance one generation. */
  tick(): void {
    this._engine.step();
    if (this._phase === "intro" && --this.ticksUntilName === 0) this.pinName();
  }

  /**
   * Any user input: a click, tap, key or scroll. During the Intro it skips straight
   * to the pinned name; once settled, a click or tap on the name replays the Intro.
   */
  input(at?: Point): void {
    if (this._phase === "intro") {
      while (this.ticksUntilName > 0) this.tick();
    } else if (at && this.canReplayAt(at)) {
      this.playIntro();
    }
  }

  /** Whether a click or tap at `at` would replay the Intro (it's on the settled name). */
  canReplayAt(at: Point): boolean {
    return this._phase === "settled" && !this.options.reducedMotion && boxContains(this.home.name, at);
  }

  private playIntro(): void {
    const pool = INTRO_SEEDS[this.home.nameLayout];
    const seed: IntroSeed = pool.seeds[Math.floor(this.random() * pool.seeds.length)];
    const area = this.resetEngine();
    // Soup as dense as the seed itself, so the seed's box doesn't show as an edge.
    this._engine.inject(introCells(seed, this.home.name, { area, density: seedDensity(seed), random: this.random }));
    this.ticksUntilName = pool.depth;
    this._phase = "intro";
    this.options.introMemory.markSeen();
  }

  private settle(): void {
    const area = this.resetEngine();
    this._engine.inject(soupCells({ area, density: AMBIENT_DENSITY, random: this.random }));
    this.pinName();
  }

  private pinName(): void {
    this._engine.setPinned(this.home.pinned);
    this.ticksUntilName = 0;
    this._phase = "settled";
  }

  /** Start over with an empty Life Engine; returns the whole Grid's area, margin included. */
  private resetEngine(): Box {
    const { viewport, margin } = this.options;
    this._engine = new LifeEngine({ width: viewport.width, height: viewport.height, margin });
    return { x: -margin, y: -margin, width: viewport.width + 2 * margin, height: viewport.height + 2 * margin };
  }
}
