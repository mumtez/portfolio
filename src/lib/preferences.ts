/**
 * The visitor's display preferences: the theme and whether the simulation runs.
 *
 * Each follows a system setting by default (the colour scheme; reduced motion, which
 * means Plain View) until the visitor makes a choice with its toggle, which is
 * remembered in browser storage. Storage may be missing, blocked or full, so every
 * access goes through `safeStore`, and a failure just means nothing is remembered.
 */
import type { Theme } from "../grid/palette";

export const THEME_KEY = "theme";
export const SIMULATION_KEY = "simulation";

/** The theme: a stored choice, or else the system's colour scheme. */
export function resolveTheme(stored: string | null, { systemLight }: { systemLight: boolean }): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemLight ? "light" : "dark";
}

/** Whether the simulation runs: a stored choice, or else on unless the system asks for reduced motion. */
export function resolveSimulation(stored: string | null, { reducedMotion }: { reducedMotion: boolean }): boolean {
  if (stored === "on" || stored === "off") return stored === "on";
  return !reducedMotion;
}

/**
 * An inline script for the `<head>`: sets `data-theme` on `<html>` before first paint,
 * so a stored choice never flashes the other theme. It does what `resolveTheme` does
 * (a test holds them to the same answers), as plain script since it can't import.
 */
export const THEME_SCRIPT = `(function () {
  var stored = null;
  try {
    stored = window.localStorage.getItem(${JSON.stringify(THEME_KEY)});
  } catch (e) {}
  var light = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = stored === "light" || stored === "dark" ? stored : light ? "light" : "dark";
})();`;

/** Remembered string values. Never throws. */
export interface PreferenceStore {
  /** The stored value, or null if there is none or storage fails. */
  get(key: string): string | null;
  /** Store a value; does nothing if storage fails. */
  set(key: string, value: string): void;
}

/** A `PreferenceStore` over `storage()`, which is called on every access since even reaching it can throw. */
export function safeStore(storage: () => Storage): PreferenceStore {
  return {
    get(key) {
      try {
        return storage().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage().setItem(key, value);
      } catch {
        // Private mode, blocked or full storage: the choice holds until the page closes.
      }
    },
  };
}
