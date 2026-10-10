import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { FONT_5X7 } from "./font-5x7";

const CONTENT = new URL("../content/", import.meta.url);

/** Every heading and nav label the Grid draws in the 5×7 font, read from the content files. */
function gridTexts(): string[] {
  const sections = parse(readFileSync(new URL("sections.yaml", CONTENT), "utf8")) as { nav: string; heading: string }[];
  const projects = readdirSync(new URL("projects/", CONTENT))
    .map((file) => readFileSync(new URL(`projects/${file}`, CONTENT), "utf8"))
    .map((md) => parse(md.split(/^---$/m)[1]) as { title: string; deepDive?: boolean })
    .filter((p) => p.deepDive);
  return [...sections.flatMap((s) => [s.nav, s.heading]), ...projects.map((p) => p.title)];
}

describe("5×7 font", () => {
  it("draws every glyph 5 cells wide and 8 tall", () => {
    for (const [ch, rows] of Object.entries(FONT_5X7)) {
      expect(rows, ch).toHaveLength(8);
      for (const row of rows) expect(row, ch).toMatch(/^[#.]{5}$/);
    }
  });

  it("has a glyph for every character in every Section heading and nav label", () => {
    const texts = gridTexts();
    expect(texts.length).toBeGreaterThan(8);
    for (const text of texts) {
      const missing = [...text.toUpperCase()].filter((ch) => ch !== " " && !FONT_5X7[ch]);
      expect(missing, text).toEqual([]);
    }
  });
});
