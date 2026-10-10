import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { builtFile } from "./built";

/** Parse a page from Astro's built output. */
function builtPage(path: string): Document {
  return parseHTML(builtFile(path)).document;
}

describe("Home (built HTML, as seen with JS off)", () => {
  const doc = builtPage("index.html");

  it("has the name as the page's only h1", () => {
    const h1s = doc.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent?.trim()).toBe("Andrew Aburustum");
  });

  it("has the one-line tagline right after the name", () => {
    const tagline = doc.querySelector("h1 + p");
    expect(tagline?.textContent?.trim()).toMatch(/Olin/);
  });

  it("has a title and description", () => {
    expect(doc.querySelector("title")?.textContent).toMatch(/Andrew Aburustum/);
    expect(doc.querySelector('meta[name="description"]')?.getAttribute("content")).toBeTruthy();
    expect(doc.documentElement.getAttribute("lang")).toBe("en");
  });

  it("hides the Grid canvas from assistive tech", () => {
    const canvas = doc.querySelector("canvas");
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
  });
});
