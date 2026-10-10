import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DARK, LIGHT } from "../../src/grid/palette";
import { THEME_SCRIPT } from "../../src/lib/preferences";
import { builtPage, DIST, SECTIONS } from "./built";

/** All the CSS a built page uses: inline `<style>`s and linked stylesheets. */
function pageCss(doc: Document): string {
  const inline = [...doc.querySelectorAll("style")].map((s) => s.textContent ?? "");
  const linked = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) =>
    readFileSync(new URL(l.getAttribute("href")!.replace(/^\//, ""), DIST), "utf8"),
  );
  return [...inline, ...linked].join("\n").toLowerCase();
}

describe.each(SECTIONS)("the toggles on %s (built HTML)", (url) => {
  const doc = builtPage(url);
  const toggle = (id: string) => doc.querySelector<HTMLButtonElement>(`button[data-toggle="${id}"]`);

  it.each([
    ["theme", /dark/i],
    ["simulation", /simulation/i],
  ])("has a real %s toggle button with a pressed state, named to include its drawn label", (id, name) => {
    const button = toggle(id);
    expect(button, id).not.toBeNull();
    expect(button!.getAttribute("type")).toBe("button");
    expect(["true", "false"]).toContain(button!.getAttribute("aria-pressed"));
    const accessibleName = button!.textContent!.replace(/\s+/g, " ").trim();
    expect(accessibleName).toMatch(name);
    const drawn = button!.getAttribute("data-label") ?? "";
    expect(drawn).not.toBe("");
    expect(accessibleName.toLowerCase()).toContain(drawn.toLowerCase());
  });

  it("keeps them together in a labelled group, hidden until the script can make them work", () => {
    const group = toggle("theme")!.closest("[role='group']");
    expect(group?.getAttribute("aria-label")).toBeTruthy();
    expect(group?.contains(toggle("simulation"))).toBe(true);
    expect(group?.hasAttribute("hidden")).toBe(true);
  });

  it("sets the theme in the head before first paint", () => {
    const scripts = [...doc.head.querySelectorAll("script:not([src]):not([type])")].map((s) => s.textContent?.trim());
    expect(scripts).toContain(THEME_SCRIPT.trim());
  });

  it("offers both colour schemes", () => {
    expect(doc.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe("light dark");
  });

  it("styles both themes: following the system, and as chosen", () => {
    const css = pageCss(doc);
    for (const colour of [DARK.background, DARK.text, LIGHT.background, LIGHT.text, LIGHT.pinned]) {
      expect(css).toContain(colour.toLowerCase());
    }
    expect(css).toMatch(/prefers-color-scheme:\s*light/);
    expect(css).toMatch(/\[data-theme=("?)light\1\]/);
    expect(css).toMatch(/\[data-theme=("?)dark\1\]/);
  });
});
