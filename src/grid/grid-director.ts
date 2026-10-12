/**
 * Grid Director: sequences what the Grid is doing and drives the Life Engine. Headless.
 *
 * Phases: Intro → Settled ⇄ Transition. On a first visit to Home the Intro plays a
 * random Intro Seed under strict Life, then pins the name. A Transition releases the
 * current Section's pins into Free Cells and pins the next Section in while real Life
 * runs. The Body Text is real HTML (ADR 0004), which the page measures into shapes and
 * hands over with `setShapes`: on navigate the old Section's lines appear as Free Cells
 * where its text was, and once the next Section's HTML has landed its lines condense out
 * of Cells over the ticks left; the last tick releases them into Life as the HTML fades
 * in. (Paused is the Ticker's job, and Off is the Plain View with no Grid at all.)
 *
 * Panels (Entries, Frames, Placeholders) are shapes too: once settled, a Panel's border
 * is pinned (every other cell of it for a dashed Panel) and its interior is walls in the
 * Life Engine, so no Cell lives behind its text or media. In a Transition the next
 * Section's borders condense in with its lines and stay pinned when the lines are
 * released; on navigate the old Section's borders are released into Life with its other
 * pins. Shapes move as the Body Text scrolls, and the borders and walls follow, snapped
 * to cells. A Button Panel (a Project Entry, a Contact link) is a Button too: hovering
 * its measured box or focusing its link (`focusPanel`) decays its border like a nav
 * Button's, told apart by its link so the decay carries on as it scrolls. A Panel's
 * label (a Contact link's EMAIL) is pinned with its border, but stays while it decays.
 */
import { boxContains, intersection, type Box } from "./box";
import {
  navItemAt,
  toggleAt,
  typesetSection,
  type SectionLayout,
  type ToggleSpec,
  type ViewportCells,
} from "./cell-typesetter";
import { INTRO_SEEDS, introCells, seedDensity, soupCells, type IntroSeed } from "./intro-seeds";
import { LifeEngine, type Point } from "./life-engine";
import { sectionPath, type GridContent } from "./routes";
import { lineInk, panelCells, type Shape } from "./shapes";

/** One generation every this many milliseconds, during the Intro and after it. */
export const TICK_MS = 120;
/**
 * Generations a Transition takes: 7 × 120ms = 840ms. The next Section's pins and its
 * Body Text's lines are all in by the one before the last, and the last releases the lines.
 */
export const TRANSITION_TICKS = 7;
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
  /** Toggles drawn as buttons in a corner of every Section (the theme and the simulation). */
  readonly toggles?: readonly ToggleSpec[];
  readonly random?: () => number;
}

const key = (p: Point) => `${p.x},${p.y}`;
/**
 * Buttons are told apart by key: a nav item's path, `toggle:` and a toggle's id, or
 * `panel:` and a Button Panel's link.
 */
const toggleKey = (id: string) => `toggle:${id}`;
const panelKey = (href: string) => `panel:${href}`;

/** A Button Panel as it shows now: its hit region (the part of its box in sight) and its border Cells. */
interface ButtonPanel {
  readonly key: string;
  readonly box: Box;
  readonly border: readonly Point[];
}

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
  /** The Body Text's shapes for the Section whose HTML is in the page, as last measured. */
  private shapes: readonly Shape[] = [];
  /**
   * During a Transition, once the next Section's HTML has landed: the Cells its lines
   * and Panel borders condense into, where they are now, and the Transition's tick when
   * they started to.
   */
  private arrivingText: readonly Point[] = [];
  private textArrivedAt: number | undefined;
  /**
   * A random number per Cell for the Section's text, drawn once each: whether a Cell of
   * a line is inked, and how early in the Transition a Cell condenses. Measuring the
   * text again (it scrolled) changes only the Cells of what moved.
   */
  private readonly inkDraws: CellDraws;
  private readonly condenseDraws: CellDraws;
  /** The toggles as they should be drawn now. */
  private toggles: readonly ToggleSpec[];
  /** Buttons whose border is unpinned for now, by key, with the generations left before it pins again. */
  private readonly unpinnedBorders = new Map<string, number>();
  /** The button under the pointer, so moving within it doesn't start its border over. */
  private hovered: string | undefined;
  /**
   * The Panels of the Section whose HTML is in the page: their border and label Cells,
   * pinned once settled, and their interiors' other Cells, walled off once settled.
   */
  private panelPins: readonly Point[] = [];
  private walls: readonly Point[] = [];
  /** The Panels among them that are Buttons, which decay on hover and focus like the nav's. */
  private buttonPanels: readonly ButtonPanel[] = [];
  private readonly random: () => number;

  constructor(private readonly options: GridDirectorOptions) {
    this.random = options.random ?? Math.random;
    this.inkDraws = new CellDraws(this.random);
    this.condenseDraws = new CellDraws(this.random);
    this.toggles = options.toggles ?? [];
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

  /**
   * The Body Text's shapes where they are now (in viewport cells), measured from the
   * Section whose HTML is in the page, replacing any before. Called once a Transition's
   * HTML has landed, and again whenever the text moves (scroll, resize). Mid-Transition,
   * the lines and Panel borders condense in over the ticks still to come; once settled,
   * the borders and walls are re-pinned where the Panels are now. The last of the
   * Section's shapes are what dissolve when the next Transition leaves it.
   */
  setShapes(shapes: readonly Shape[]): void {
    this.shapes = shapes;
    this.placePanels();
    if (this._phase === "settled") {
      this.setPinned(this.pinnedNow);
      this._engine.setWalls(this.walls);
    }
    if (this._phase !== "transition") return;
    this.textArrivedAt ??= this.transitionTick;
    this.arrivingText = [...this.textInk(), ...this.panelPins];
    this.pinArriving(this.transitionTick);
  }

  /** The Cells the lines of Body Text are drawn as while they condense or dissolve. */
  private textInk(): Point[] {
    return lineInk(this.shapes, (cell) => this.inkDraws.at(cell));
  }

  /**
   * Where the Panels' borders and walls go: everywhere their shapes say, but under the
   * nav and toggles, which the text can scroll beneath. Buttons stay drawn whole.
   */
  private placePanels(): void {
    const { border, label, interior } = panelCells(this.shapes);
    const boxes = [...this._layout.nav, ...this._layout.toggles].map((b) => b.box);
    const clear = (p: Point) => !boxes.some((box) => boxContains(box, p));
    this.panelPins = [...border, ...label].filter(clear);
    this.walls = interior.filter(clear);
    this.buttonPanels = this.shapes.flatMap((s) =>
      s.kind === "panel" && s.panel === "button" && s.href !== undefined
        ? [
            {
              key: panelKey(s.href),
              box: s.clip ? intersection(s.box, s.clip) : s.box,
              border: panelCells([s]).border.filter(clear),
            },
          ]
        : [],
    );
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
    const toggle = at && toggleAt(this._layout, at);
    const button =
      at &&
      (navItemAt(this._layout, at)?.path ??
        (toggle ? toggleKey(toggle.id) : undefined) ??
        this.buttonPanels.find((b) => boxContains(b.box, at))?.key);
    if (button && button !== this.hovered) this.unpinBorder(button);
    this.hovered = button;
  }

  /** The button for the Section at `path` has keyboard focus: its border decays as on hover. */
  focus(path: string): void {
    this.unpinBorder(sectionPath(path));
  }

  /** The Button Panel whose link is `href` (as its HTML has it) has keyboard focus: its border decays as on hover. */
  focusPanel(href: string): void {
    this.unpinBorder(panelKey(href));
  }

  /** The toggle `id` has keyboard focus: its border decays as on hover. */
  focusToggle(id: string): void {
    this.unpinBorder(toggleKey(id));
  }

  /**
   * The toggles have changed (one was pressed): draw them as they are now, at once and
   * without a Transition. Mid-Transition, the next Section still arrives as planned.
   */
  setToggles(toggles: readonly ToggleSpec[]): void {
    this.toggles = toggles;
    const before = new Set(this._layout.pinned.map(key));
    this._layout = this.typeset(this._route);
    this.placePanels();
    // The Intro pins the layout as it is when the name forms.
    if (this._phase === "intro") return;
    if (this._phase === "settled") this._engine.setWalls(this.walls);
    const after = new Set(this._layout.pinned.map(key));
    const stays = (p: Point) => after.has(key(p));
    const added = this._layout.pinned.filter((p) => !before.has(key(p)));
    this.kept = [...this.kept.filter(stays), ...added];
    this.arriving = this.arriving.filter(stays);
    this.setPinned([...this.pinnedNow.filter(stays), ...added]);
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
    // Its shapes come with its HTML; the page sets them once that's in.
    this.dissolveText();
    const target = this._layout.pinned;
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
   * The Section being left: its lines of Body Text appear as Free Cells where its text
   * was, and its Panels' walls go and their borders are released with its other pins,
   * for Life to tear apart as its HTML fades out. A Section still arriving has no text
   * showing; whatever of it had condensed is released with its other pins.
   */
  private dissolveText(): void {
    // The walls go first: Cells can't be brought to life in a wall.
    this.walls = [];
    this._engine.setWalls([]);
    if (this._phase === "settled") this._engine.inject(this.textInk());
    this.shapes = [];
    this.panelPins = [];
    this.arrivingText = [];
    this.textArrivedAt = undefined;
    // The next Section's text is drawn afresh.
    this.inkDraws.clear();
    this.condenseDraws.clear();
  }

  /**
   * Pin the share of the arriving pins due after `tick` generations of the Transition:
   * all of them on the generation before the last, which then settles, releasing the
   * lines. Lines whose HTML landed late condense over the ticks left.
   */
  private pinArriving(tick: number): void {
    if (tick >= TRANSITION_TICKS) {
      this.pinLayout();
      return;
    }
    const last = TRANSITION_TICKS - 1;
    /** How much of what started condensing on tick `from` is in by now, from 0 to 1. */
    const condensed = (from: number) => (from >= last ? 1 : (tick - from) / (last - from));
    const textIn = this.textArrivedAt === undefined ? 0 : condensed(this.textArrivedAt);
    this.setPinned([
      ...this.kept,
      ...this.arriving.slice(0, Math.ceil(this.arriving.length * condensed(0))),
      // Each Cell of the text condenses on its own draw, so the ones in stay in when it's measured again.
      ...this.arrivingText.filter((cell) => this.condenseDraws.at(cell) < textIn),
    ]);
  }

  /**
   * Release a button's border into Free Cells for `BORDER_UNPIN_TICKS` generations. Not
   * during the Intro, which is strict Life, nor under reduced motion; and a border
   * already decaying runs its course rather than starting over.
   */
  private unpinBorder(button: string): void {
    if (this._phase === "intro" || this.options.reducedMotion || this.unpinnedBorders.has(button))
      return;
    if (!this.buttons().some((b) => b.key === button)) return;
    this.unpinnedBorders.set(button, BORDER_UNPIN_TICKS);
    this.setPinned(this.pinnedNow);
  }

  /** Every button on screen, nav items, toggles and Button Panels, by key. */
  private buttons(): { key: string; border: readonly Point[] }[] {
    return [
      ...this._layout.nav.map((i) => ({ key: i.path, border: i.border })),
      ...this._layout.toggles.map((t) => ({ key: toggleKey(t.id), border: t.border })),
      ...this.buttonPanels,
    ];
  }

  /** One generation has passed: pin again the borders whose time is up. */
  private countDownBorders(): void {
    let due = false;
    for (const [button, left] of this.unpinnedBorders) {
      if (left > 1) this.unpinnedBorders.set(button, left - 1);
      else due = this.unpinnedBorders.delete(button);
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
    this._engine.inject(
      introCells(seed, title, { area, density: seedDensity(seed), random: this.random }),
    );
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

  /**
   * Settle: pin exactly the current layout and its Panels' borders, and wall off the
   * Panels' interiors.
   */
  private pinLayout(): void {
    this._phase = "settled";
    this.setPinned(this._layout.pinned);
    this._engine.setWalls(this.walls);
    this.ticksUntilName = 0;
    this.kept = [];
    this.arriving = [];
    this.arrivingText = [];
    this.textArrivedAt = undefined;
  }

  /**
   * Pin `layoutPoints`, and once settled the Panels' borders, less the borders of buttons
   * that are decaying for now.
   */
  private setPinned(layoutPoints: readonly Point[]): void {
    this.pinnedNow = layoutPoints;
    const points = this._phase === "settled" ? [...layoutPoints, ...this.panelPins] : layoutPoints;
    const decaying = new Set(
      this.buttons()
        .filter((b) => this.unpinnedBorders.has(b.key))
        .flatMap((b) => b.border.map(key)),
    );
    this._engine.setPinned(decaying.size ? points.filter((p) => !decaying.has(key(p))) : points);
  }

  private typeset(route: string): SectionLayout {
    return typesetSection(this.options.viewport, this.options.content, route, this.toggles);
  }

  /** Start over with an empty Life Engine; returns the whole Grid's area, margin included. */
  private resetEngine(): Box {
    const { viewport, margin } = this.options;
    this._engine = new LifeEngine({ width: viewport.width, height: viewport.height, margin });
    this._engine.setWalls(this.walls);
    return {
      x: -margin,
      y: -margin,
      width: viewport.width + 2 * margin,
      height: viewport.height + 2 * margin,
    };
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

/** A random number per Cell, drawn the first time it's asked for and the same after, until cleared. */
class CellDraws {
  private readonly drawn = new Map<string, number>();

  constructor(private readonly random: () => number) {}

  at(cell: Point): number {
    const k = key(cell);
    let draw = this.drawn.get(k);
    if (draw === undefined) this.drawn.set(k, (draw = this.random()));
    return draw;
  }

  clear(): void {
    this.drawn.clear();
  }
}
