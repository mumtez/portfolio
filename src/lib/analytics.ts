/**
 * GoatCounter page views: no cookies, so no consent banner. Each Section URL is counted
 * as its own path.
 *
 * Full page loads are counted by GoatCounter's script (in `layouts/Base.astro`). When a
 * Section changes without a page load (a Transition updating the URL via the History API),
 * call `countPageView` with the new path.
 */

/** The site code from GoatCounter: `<code>.goatcounter.com`. */
export const GOATCOUNTER_SITE_CODE = "coolperson11";

/** Where GoatCounter's script sends views. */
export const GOATCOUNTER_ENDPOINT = `https://${GOATCOUNTER_SITE_CODE}.goatcounter.com/count`;

/** GoatCounter's script, loaded from its own CDN. */
export const GOATCOUNTER_SCRIPT = "https://gc.zgo.at/count.js";

interface GoatCounter {
  count(vars: { path: string }): void;
}

declare global {
  interface Window {
    goatcounter?: GoatCounter;
  }
}

/**
 * Count a view of the Section at `path` (e.g. `/projects/baja/`). Does nothing if
 * GoatCounter hasn't loaded yet or is blocked, so callers never need to check.
 */
export function countPageView(path: string): void {
  if (typeof window === "undefined") return;
  window.goatcounter?.count({ path });
}
