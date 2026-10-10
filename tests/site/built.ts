import { readFileSync } from "node:fs";

/** Read a file from Astro's built output (`npm run test:site` builds first). */
export function builtFile(path: string): string {
  return readFileSync(new URL(`../../dist/${path}`, import.meta.url), "utf8");
}
