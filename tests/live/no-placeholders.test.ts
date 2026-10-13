import { readdirSync, readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { DIST } from "../site/built";

/** Every built page, by its path under dist/. */
function builtPages(dir: URL = DIST): { path: string; document: Document }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);
    if (entry.isDirectory()) return builtPages(url);
    if (!entry.name.endsWith(".html")) return [];
    const path = url.pathname.slice(DIST.pathname.length);
    return [{ path, document: parseHTML(readFileSync(url, "utf8")).document }];
  });
}

// The live build (`npm run build`, as deployed) leaves out everything still waiting for
// Andrew's words or media; `npm run dev` and the test builds show it.
describe.each(builtPages())("the live build of $path", ({ document }) => {
  it("shows no Placeholder", () => {
    expect(document.querySelectorAll(".placeholder")).toHaveLength(0);
    expect(document.querySelectorAll('[data-panel="dashed"]')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/Placeholder:/);
  });

  it("has no empty Frame: every one shows its photo or video", () => {
    for (const slot of document.querySelectorAll(".frame-slot")) {
      expect(slot.querySelector("img, video")).not.toBeNull();
    }
  });

  it("has no block left with only a heading", () => {
    for (const panel of document.querySelectorAll("section[data-panel]")) {
      const content = [...panel.children].filter((el) => !/^H[1-6]$/.test(el.tagName));
      expect(content.length, panel.textContent ?? "").toBeGreaterThan(0);
    }
  });
});
