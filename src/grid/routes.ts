/**
 * Routes: which Sections the Grid knows, and the URL path of each.
 */

/** What the Grid draws of one Section, from the same content as its Plain View. */
export interface GridSection {
  /** The Section's URL path, with a trailing slash: `/`, `/about/`, `/projects/baja/`. */
  readonly path: string;
  /** The Section's h1. On Home it's the name, which is drawn in the name glyphs instead. */
  readonly heading: string;
  /** Its label in the nav, for the top-level Sections; Deep Dives have none. */
  readonly nav?: string;
}

export interface GridContent {
  /** Every Section, top-level ones in nav order. */
  readonly sections: readonly GridSection[];
}

/** A URL's pathname as a Section path: `/about` and `/about/index.html` are both `/about/`. */
export function sectionPath(pathname: string): string {
  const path = pathname.replace(/index\.html$/, "");
  return path.endsWith("/") ? path : `${path}/`;
}

/** Whether `path` is one of the Sections. */
export function hasSection(content: GridContent, path: string): boolean {
  return content.sections.some((s) => s.path === path);
}

/**
 * How a link to `linkPath` is marked while the Section at `here` shows, as an
 * aria-current value: "page" for the Section itself, "true" for Projects on its Deep
 * Dives. The Grid underlines a nav item whenever this is set.
 */
export function currentness(linkPath: string, here: string): "page" | "true" | undefined {
  if (linkPath === here) return "page";
  if (linkPath !== "/" && here.startsWith(linkPath)) return "true";
  return undefined;
}

/** A click on a link, as far as deciding what to do with it goes. */
export interface LinkClick {
  /** The link's `href`, as written; it's resolved against the current URL. */
  readonly href: string;
  readonly target: string;
  readonly download: boolean;
  readonly button: number;
  /** Ctrl, Cmd, Shift or Alt held: the visitor wants a new tab or window, or a download. */
  readonly modified: boolean;
}

/**
 * The Section a link click should run a Transition to, or undefined to leave the click
 * to the browser: links off the site or to files, links to the Section already showing
 * (including `#` links within it), and clicks meant for a new tab, window or download.
 */
export function transitionPathFor(click: LinkClick, here: URL, content: GridContent): string | undefined {
  if (click.button !== 0 || click.modified || click.download) return undefined;
  if (click.target && click.target !== "_self") return undefined;
  const url = new URL(click.href, here);
  if (url.origin !== here.origin) return undefined;
  const path = sectionPath(url.pathname);
  if (path === sectionPath(here.pathname)) return undefined;
  return hasSection(content, path) ? path : undefined;
}
