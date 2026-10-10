import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

/** Astro's built output (`npm run test:site` builds first). */
export const DIST = new URL("../../dist/", import.meta.url);

/** Every Section's URL path. */
export const SECTIONS = [
  "/",
  "/about/",
  "/experience/",
  "/projects/",
  "/projects/roborebels/",
  "/projects/baja/",
  "/projects/ftc-event-viewer/",
  "/contact/",
];

/** Read a file from Astro's built output. */
export function builtFile(path: string): string {
  return readFileSync(new URL(path, DIST), "utf8");
}

/** The built file Astro writes for a URL path, e.g. `/about/` → `dist/about/index.html`. */
export function builtPath(urlPath: string): URL {
  const path = urlPath.replace(/^\//, "");
  return new URL(path === "" || path.endsWith("/") ? `${path}index.html` : path, DIST);
}

/** Parse the built HTML for a URL path. */
export function builtPage(urlPath: string): Document {
  return parseHTML(readFileSync(builtPath(urlPath), "utf8")).document;
}
