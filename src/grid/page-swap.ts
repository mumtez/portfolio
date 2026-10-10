/**
 * Page swap: the Plain View side of a Transition. Fetches the next Section's static
 * HTML (the same page a reload or a visitor with JS off gets) and swaps its `<main>`,
 * title and meta tags into this page, so the one Grid keeps running underneath (ADR 0005).
 */
import { sectionPath } from "./routes";

const pages = new Map<string, Promise<Document>>();
/** Bumped on every swap, so a slow fetch can't land after a later one. */
let latest = 0;

function fetchPage(path: string): Promise<Document> {
  let page = pages.get(path);
  if (!page) {
    page = fetch(path, { headers: { Accept: "text/html" } }).then(async (res) => {
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return new DOMParser().parseFromString(await res.text(), "text/html");
    });
    // Forget failures, so a later attempt can retry.
    page.catch(() => pages.delete(path));
    pages.set(path, page);
  }
  return page;
}

/** Start fetching a Section's page ahead of a likely click. */
export function prefetchSection(path: string): void {
  fetchPage(path).catch(() => {});
}

/**
 * Show the Section at `path`: swap in its `<main>`, title and meta tags, mark its nav
 * link current, and move focus to its heading so screen readers announce it. Resolves
 * false if another swap started meanwhile. Rejects if the page can't be fetched.
 */
export async function swapToSection(path: string): Promise<boolean> {
  const token = ++latest;
  const next = await fetchPage(path);
  if (token !== latest) return false;

  const main = document.querySelector("main");
  const nextMain = next.querySelector("main");
  if (!main || !nextMain) throw new Error(`${path}: no <main> to swap`);

  mergeHeadStyles(next);
  document.title = next.title;
  syncMeta(next);
  const incoming = document.importNode(nextMain, true);
  incoming.classList.add("arriving");
  main.replaceWith(incoming);
  markCurrent(path);

  const heading = incoming.querySelector("h1");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
  return true;
}

/** Page styles Astro inlines per page; the next Section's must be present before its HTML is. */
function mergeHeadStyles(next: Document): void {
  const have = new Set([...document.head.querySelectorAll("style, link[rel='stylesheet']")].map((el) => el.outerHTML));
  for (const el of next.head.querySelectorAll("style, link[rel='stylesheet']")) {
    if (!have.has(el.outerHTML)) document.head.append(document.importNode(el, true));
  }
}

/** Copy `<meta name>` and `<meta property>` content (description, Open Graph) from the next page. */
function syncMeta(next: Document): void {
  for (const meta of next.head.querySelectorAll<HTMLMetaElement>("meta[name], meta[property]")) {
    const attr = meta.hasAttribute("name") ? "name" : "property";
    const sel = `meta[${attr}="${CSS.escape(meta.getAttribute(attr) ?? "")}"]`;
    const mine = document.head.querySelector<HTMLMetaElement>(sel);
    if (mine) mine.content = meta.content;
    else document.head.append(document.importNode(meta, true));
  }
}

/** Mark the header nav link for `path` with aria-current, as the built page for it does. */
function markCurrent(path: string): void {
  for (const a of document.querySelectorAll<HTMLAnchorElement>("header nav a")) {
    if (sectionPath(a.pathname) === path) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}
