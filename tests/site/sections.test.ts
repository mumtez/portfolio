import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { builtPage, DIST, SECTIONS } from "./built";

function text(el: Element | Document | null | undefined): string {
  const node = el && "body" in el ? el.body : el;
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function allBuiltHtml(dir: URL = DIST): { path: string; html: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);
    if (entry.isDirectory()) return allBuiltHtml(url);
    if (!entry.name.endsWith(".html")) return [];
    return [{ path: url.pathname.slice(DIST.pathname.length), html: readFileSync(url, "utf8") }];
  });
}

/** Lowercase letters and digits only, so "(201) 555" and "201-555" compare equal. */
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readPrivateTerms(): string[] {
  let terms = process.env.PRIVATE_TERMS?.split(",") ?? [];
  const file = new URL("../../.private-terms", import.meta.url);
  if (existsSync(file)) terms = terms.concat(readFileSync(file, "utf8").split("\n"));
  return terms.map(squash).filter(Boolean);
}

describe.each(SECTIONS)("Section %s (built HTML, as seen with JS off)", (url) => {
  const doc = builtPage(url);

  it("has exactly one h1", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(text(doc.querySelector("h1"))).not.toBe("");
  });

  it("has a nav linking every Section", () => {
    const nav = doc.querySelector("nav");
    const hrefs = [...(nav?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs.sort()).toEqual([...SECTIONS].sort());
  });

  it("lists the top-level Sections in nav order", () => {
    const top = [...doc.querySelectorAll("nav > ul > li > a")].map((a) => a.getAttribute("href"));
    expect(top).toEqual(["/", "/about/", "/experience/", "/projects/", "/contact/"]);
  });

  it("marks its own nav link as the current page", () => {
    const current = doc.querySelectorAll('nav a[aria-current="page"]');
    expect([...current].map((a) => a.getAttribute("href"))).toEqual([url]);
  });

  it("marks Projects as current on a Deep Dive, as the Grid underlines it", () => {
    const parents = [...doc.querySelectorAll('nav a[aria-current="true"]')].map((a) => a.getAttribute("href"));
    expect(parents).toEqual(url.startsWith("/projects/") && url !== "/projects/" ? ["/projects/"] : []);
  });

  it("gives screen readers a labelled nav, and a name for every link and button", () => {
    expect(doc.querySelector("nav")?.getAttribute("aria-label")).toBeTruthy();
    for (const el of doc.querySelectorAll("a, button")) {
      const labelledBy = el.getAttribute("aria-labelledby");
      const name =
        el.getAttribute("aria-label") ??
        (labelledBy ? text(doc.getElementById(labelledBy)) : null) ??
        (text(el) || el.getAttribute("title") || "");
      expect(name, el.outerHTML).not.toBe("");
      expect(el.getAttribute("aria-hidden"), el.outerHTML).not.toBe("true");
      expect(el.getAttribute("tabindex") ?? "0", el.outerHTML).not.toBe("-1");
    }
    for (const a of doc.querySelectorAll("a")) expect(a.getAttribute("href"), a.outerHTML).toBeTruthy();
  });

  it("has a title and description", () => {
    expect(doc.querySelector("title")?.textContent).toMatch(/Andrew Aburustum/);
    expect(doc.querySelector('meta[name="description"]')?.getAttribute("content")).toBeTruthy();
  });

  it("puts its content in a main landmark", () => {
    expect(doc.querySelectorAll("main")).toHaveLength(1);
    expect(doc.querySelector("main h1")).not.toBeNull();
  });

  it("has the Grid, hidden from assistive tech", () => {
    expect(doc.querySelector("canvas#grid")?.getAttribute("aria-hidden")).toBe("true");
    expect(doc.querySelector('script[type="module"]')).not.toBeNull();
  });

  it("embeds the Grid's cell content: every Section, with this one's heading as its h1", () => {
    const json = doc.querySelector("script#grid-content")?.textContent ?? "";
    const content = JSON.parse(json) as { sections: { path: string; heading: string; nav?: string }[] };
    expect(content.sections.map((s) => s.path).sort()).toEqual([...SECTIONS].sort());
    const navLinks = [...doc.querySelectorAll("nav > ul > li > a")].map((a) => [a.getAttribute("href"), text(a)]);
    expect(content.sections.filter((s) => s.nav).map((s) => [s.path, s.nav])).toEqual(navLinks);
    expect(content.sections.find((s) => s.path === url)?.heading).toBe(text(doc.querySelector("h1")));
  });
});

describe("Section content", () => {
  it("About covers Olin, a bio, languages and activities", () => {
    const main = builtPage("/about/").querySelector("main");
    const headings = [...(main?.querySelectorAll("h2") ?? [])].map(text);
    expect(headings).toEqual(expect.arrayContaining(["Education", "About me", "Languages", "Activities"]));
    expect(text(main)).toMatch(/Olin College of Engineering/);
    expect(text(main)).toMatch(/Electrical and Computer Engineering/);
    const items = [...(main?.querySelectorAll("li") ?? [])].map(text).join(" | ");
    expect(items).toMatch(/Italian/);
    expect(items).toMatch(/Arabic/);
    expect(items).toMatch(/Handball/);
  });

  it("Experience covers Memorial Sloan Kettering and Olin IT, with bullet lists", () => {
    const main = builtPage("/experience/").querySelector("main");
    const headings = [...(main?.querySelectorAll("h2") ?? [])].map(text);
    expect(headings).toEqual(["Memorial Sloan Kettering Cancer Center", "Olin College IT Department"]);
    expect(main?.querySelectorAll("ul li").length).toBeGreaterThanOrEqual(3);
  });

  it("Projects lists every project and links the three Deep Dives", () => {
    const main = builtPage("/projects/").querySelector("main");
    const headings = [...(main?.querySelectorAll("h2") ?? [])].map(text);
    expect(headings).toEqual([
      "FTC RoboRebels",
      "Baja fuel-level estimator",
      "FTC Event Viewer",
      "AI & Machine Learning",
      "Homelab",
      "Console & GPU Repair",
    ]);
    const links = [...(main?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(links).toEqual(
      expect.arrayContaining(["/projects/roborebels/", "/projects/baja/", "/projects/ftc-event-viewer/"]),
    );
  });

  it("Contact gives email, GitHub and LinkedIn", () => {
    const main = builtPage("/contact/").querySelector("main");
    const links = [...(main?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(links).toEqual(
      expect.arrayContaining([
        "mailto:aaburustum@olin.edu",
        "https://github.com/mumtez",
        "https://www.linkedin.com/in/andrew-aburustum",
      ]),
    );
  });
});

describe("Deep Dive Body Text", () => {
  it.each(["roborebels", "baja", "ftc-event-viewer"])("%s renders its Markdown file's body", (id) => {
    const markdown = readFileSync(new URL(`../../src/content/projects/${id}.md`, import.meta.url), "utf8");
    const body = markdown.replace(/^---[\s\S]*?\n---\n/, "");
    const firstParagraph = body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !/^[#>\-*<]/.test(p));
    expect(firstParagraph).toBeTruthy();
    // Markdown renders straight quotes as curly ones.
    const straighten = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    const plain = firstParagraph!.replace(/[*_`]/g, "").replace(/\s+/g, " ");
    expect(straighten(text(builtPage(`/projects/${id}/`).querySelector("main")))).toContain(plain);
  });
});

describe("Deep Dive Frames", () => {
  it.each(["roborebels", "baja", "ftc-event-viewer"])("%s has Frame slots inside its Body Text", (id) => {
    const frames = builtPage(`/projects/${id}/`).querySelectorAll("main .body-text figure.frame .frame-slot");
    expect(frames.length).toBeGreaterThan(0);
  });

  it.each(["roborebels", "baja", "ftc-event-viewer"])("%s shows, for each missing photo or video, the file it wants", (id) => {
    for (const frame of builtPage(`/projects/${id}/`).querySelectorAll("figure.frame")) {
      const slot = frame.getAttribute("data-frame");
      const media = frame.querySelector("img, video");
      if (media) {
        expect(media.getAttribute("src")).toMatch(new RegExp(`^/media/${id}/${slot}\\.`));
        expect(media.getAttribute("alt") ?? media.getAttribute("aria-label")).toBeTruthy();
      } else {
        expect(text(frame.querySelector(".placeholder"))).toContain(`public/media/${id}/${slot}.jpg`);
      }
    }
  });

  it("places a Frame where its marker is in the Markdown", () => {
    const body = builtPage("/projects/roborebels/").querySelector(".body-text");
    const order = [...(body?.children ?? [])].map((el) => el.getAttribute("data-frame") ?? el.tagName.toLowerCase());
    expect(order.indexOf("robot")).toBeLessThan(order.indexOf("h2"));
    expect(order.indexOf("match")).toBeGreaterThan(order.indexOf("h2"));
  });
});

describe("Privacy", () => {
  const pages = allBuiltHtml();

  it("found the built pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(SECTIONS.length);
  });

  it("no built page contains a phone number", () => {
    for (const { path, html } of pages) {
      expect(html, path).not.toMatch(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
      expect(html, path).not.toMatch(/tel:/i);
    }
  });

  // The home town and phone number themselves are never committed, not even hashed (a hash of
  // one word is easy to reverse). List them one per line in `.private-terms` (gitignored), or
  // comma-separated in the PRIVATE_TERMS environment variable (e.g. from a CI secret).
  const privateTerms = readPrivateTerms();

  it.skipIf(privateTerms.length === 0)("no built page contains the home town or phone number", () => {
    for (const { path, html } of pages) {
      const page = squash(html);
      for (const term of privateTerms) expect(page.includes(term), `${path} contains a private term`).toBe(false);
    }
  });
});

describe("Placeholders", () => {
  const list = readFileSync(new URL("../../PLACEHOLDERS.md", import.meta.url), "utf8").replace(/\s+/g, " ");
  const placeholders = allBuiltHtml().flatMap(({ path, html }) =>
    [...parseHTML(html).document.querySelectorAll(".placeholder")].map((el) => ({ path, el })),
  );

  it("there are placeholders while Andrew's own copy is missing", () => {
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it("every placeholder is visibly labelled", () => {
    for (const { path, el } of placeholders) expect(text(el), path).toMatch(/^Placeholder:/);
  });

  it("every placeholder is listed in PLACEHOLDERS.md", () => {
    for (const { path, el } of placeholders) {
      const note = text(el).replace(/^Placeholder:\s*/, "");
      expect(list, `${path}: "${note}"`).toContain(note);
    }
  });
});
