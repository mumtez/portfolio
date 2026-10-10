/**
 * The theme and simulation toggles: two real `<button>`s with `aria-pressed`, drawn in
 * the Grid's corner as Buttons while it runs, ordinary buttons in the Plain View.
 *
 * The theme follows the system's colour scheme until the visitor picks one (the inline
 * head script has already set it before first paint). The simulation runs unless the
 * system asks for reduced motion, until the visitor switches it; off is the Plain View
 * with no Grid. Both choices are remembered through a `safeStore`.
 */
import {
  resolveSimulation,
  resolveTheme,
  safeStore,
  SIMULATION_KEY,
  THEME_KEY,
} from "../lib/preferences";
import type { ToggleSpec } from "./cell-typesetter";
import { startGrid, type Grid } from "./grid";
import { PALETTES, type Theme } from "./palette";
import type { GridContent } from "./routes";

export interface ToggleOptions {
  readonly canvas: HTMLCanvasElement;
  readonly content: GridContent;
}

export function startToggles({ canvas, content }: ToggleOptions): void {
  const store = safeStore(() => window.localStorage);
  const systemLight = window.matchMedia("(prefers-color-scheme: light)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const themeButton = document.querySelector<HTMLButtonElement>('button[data-toggle="theme"]');
  const simulationButton = document.querySelector<HTMLButtonElement>('button[data-toggle="simulation"]');
  /** The toggles' wrapper, hidden in the built HTML since they do nothing without this script. */
  const group = themeButton?.closest<HTMLElement>("[hidden]");

  // Choices made this visit hold even if storage can't keep them.
  const stored = store.get(THEME_KEY);
  let themeChosen = stored === "light" || stored === "dark";
  let theme: Theme = resolveTheme(stored, { systemLight: systemLight.matches });
  let simulation = resolveSimulation(store.get(SIMULATION_KEY), { reducedMotion });
  let grid: Grid | undefined;

  /** The toggles as the Grid draws them, labelled as on the page: pressed means dark, and running. */
  const specs = (): ToggleSpec[] => [
    { id: "theme", label: themeButton?.dataset.label ?? "", pressed: theme === "dark" },
    { id: "simulation", label: simulationButton?.dataset.label ?? "", pressed: simulation },
  ];

  function show(): void {
    document.documentElement.dataset.theme = theme;
    themeButton?.setAttribute("aria-pressed", String(theme === "dark"));
    simulationButton?.setAttribute("aria-pressed", String(simulation));
    grid?.setPalette(PALETTES[theme]);
    grid?.setToggles(specs());
  }

  function setTheme(next: Theme): void {
    if (next === theme) return;
    theme = next;
    show();
  }

  function runSimulation(): void {
    if (simulation && !grid) {
      grid = startGrid({ canvas, content, palette: PALETTES[theme], reducedMotion, toggles: specs() });
    } else if (!simulation && grid) {
      grid.stop();
      grid = undefined;
    }
  }

  themeButton?.addEventListener("click", () => {
    const next = theme === "dark" ? "light" : "dark";
    themeChosen = true;
    store.set(THEME_KEY, next);
    setTheme(next);
  });
  // Until the visitor picks a theme, follow the system's colour scheme as it changes.
  systemLight.addEventListener("change", () => {
    if (!themeChosen) setTheme(resolveTheme(null, { systemLight: systemLight.matches }));
  });
  simulationButton?.addEventListener("click", () => {
    simulation = !simulation;
    store.set(SIMULATION_KEY, simulation ? "on" : "off");
    show();
    runSimulation();
  });

  group?.removeAttribute("hidden");
  show();
  runSimulation();
}
