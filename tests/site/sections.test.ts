import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { builtPage, builtPath, DIST, SECTIONS, TEST_SECTION } from "./built";

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
  const deepDive = url.startsWith("/projects/") && url !== "/projects/";

  it("has exactly one h1", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(text(doc.querySelector("h1"))).not.toBe("");
  });

  it("has a nav of exactly the five top-level Sections, in order (Deep Dives are reached from Projects)", () => {
    const hrefs = [...doc.querySelectorAll("nav a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/about/", "/experience/", "/projects/", "/contact/"]);
  });

  if (url !== "/") {
    it(`keeps its h1 for screen readers, ${deepDive ? "visible at the top of its Body Text, under the link back to Projects" : "visually hidden (the underlined nav Button says where you are)"}`, () => {
      const h1 = doc.querySelector("main h1");
      expect(h1?.classList.contains("visually-hidden")).toBe(!deepDive);
      const before = deepDive ? h1?.previousElementSibling : null;
      expect(h1?.parentElement?.firstElementChild).toBe(before ?? h1);
      if (deepDive) {
        expect(before?.previousElementSibling).toBeNull();
        expect(before?.querySelector('a[href="/projects/"]')).not.toBeNull();
      }
    });
  }

  if (deepDive) {
    it("links back to Projects once, above its title, not at the bottom", () => {
      const links = [...doc.querySelectorAll('main a[href="/projects/"]')];
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute("data-cell-icon")).toBe("arrow-left");
      expect(links[0].textContent?.replace(/\s+/g, " ").trim()).toBe("← All projects");
    });
  }

  it("marks its own nav link as the current page (a Deep Dive has none)", () => {
    const current = doc.querySelectorAll('nav a[aria-current="page"]');
    expect([...current].map((a) => a.getAttribute("href"))).toEqual(deepDive ? [] : [url]);
  });

  it("marks Projects as current on a Deep Dive, as the Grid underlines it", () => {
    const parents = [...doc.querySelectorAll('nav a[aria-current="true"]')].map((a) =>
      a.getAttribute("href"),
    );
    expect(parents).toEqual(
      url.startsWith("/projects/") && url !== "/projects/" ? ["/projects/"] : [],
    );
  });

  it("gives screen readers a labelled nav, and a name for every link and button", () => {
    expect(doc.querySelector("nav")?.getAttribute("aria-label")).toBeTruthy();
    for (const el of doc.querySelectorAll("a, button")) {
      const labelledBy = el.getAttribute("aria-labelledby");
      const name =
        el.getAttribute("aria-label") ??
        (labelledBy
          ? labelledBy
              .split(/\s+/)
              .map((id) => text(doc.getElementById(id)))
              .join(" ")
              .trim()
          : null) ??
        (text(el) || el.getAttribute("title") || "");
      expect(name, el.outerHTML).not.toBe("");
      expect(el.getAttribute("aria-hidden"), el.outerHTML).not.toBe("true");
      expect(el.getAttribute("tabindex") ?? "0", el.outerHTML).not.toBe("-1");
    }
    for (const a of doc.querySelectorAll("a"))
      expect(a.getAttribute("href"), a.outerHTML).toBeTruthy();
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
    const content = JSON.parse(json) as {
      sections: { path: string; heading: string; nav?: string }[];
    };
    expect(content.sections.map((s) => s.path).sort()).toEqual([...SECTIONS].sort());
    const navLinks = [...doc.querySelectorAll("nav > ul > li > a")].map((a) => [
      a.getAttribute("href"),
      text(a),
    ]);
    expect(content.sections.filter((s) => s.nav).map((s) => [s.path, s.nav])).toEqual(navLinks);
    expect(content.sections.find((s) => s.path === url)?.heading).toBe(
      text(doc.querySelector("h1")),
    );
  });
});

describe("Section content", () => {
  it("About covers Olin, a bio, languages and activities", () => {
    const main = builtPage("/about/").querySelector("main");
    const headings = [...(main?.querySelectorAll("h2") ?? [])].map(text);
    expect(headings).toEqual(
      expect.arrayContaining(["Education", "About me", "Languages", "Activities"]),
    );
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
    expect(headings).toEqual([
      "Memorial Sloan Kettering Cancer Center",
      "Olin College IT Department",
    ]);
    expect(main?.querySelectorAll("ul li").length).toBeGreaterThanOrEqual(3);
  });

  it("Projects lists every project and links the three Deep Dives", () => {
    const main = builtPage("/projects/").querySelector("main");
    const headings = [...(main?.querySelectorAll("h2") ?? [])].map(text);
    expect(headings).toEqual([
      "FTC RoboRebels",
      "Baja fuel-level estimator",
      "FTC Event Viewer",
      "Humanoid robot",
      "AI & Machine Learning",
      "Homelab",
      "Console & GPU Repair",
    ]);
    const links = [...(main?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(links).toEqual(
      expect.arrayContaining([
        "/projects/roborebels/",
        "/projects/baja/",
        "/projects/ftc-event-viewer/",
      ]),
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

  it("Contact's links are Button Panels, each with a short Cell label and its full name", () => {
    const main = builtPage("/contact/").querySelector("main");
    const buttons = [...(main?.querySelectorAll("a") ?? [])].map((a) => ({
      href: a.getAttribute("href"),
      panel: a.getAttribute("data-panel"),
      label: a.getAttribute("data-cell-label"),
      name: text(a),
      download: a.hasAttribute("download"),
    }));
    expect(buttons).toEqual([
      {
        href: "mailto:aaburustum@olin.edu",
        panel: "button",
        label: "EMAIL",
        name: "aaburustum@olin.edu",
        download: false,
      },
      {
        href: "https://github.com/mumtez",
        panel: "button",
        label: "GITHUB",
        name: "github.com/mumtez",
        download: false,
      },
      {
        href: "https://www.linkedin.com/in/andrew-aburustum",
        panel: "button",
        label: "LINKEDIN",
        name: "linkedin.com/in/andrew-aburustum",
        download: false,
      },
      {
        href: "/andrew-aburustum-resume.pdf",
        panel: "button",
        label: "RESUME",
        name: "Download my resume (PDF)",
        download: true,
      },
    ]);
  });
});

describe("Deep Dive Body Text", () => {
  it.each(["roborebels", "baja", "ftc-event-viewer"])(
    "%s renders its Markdown file's body",
    (id) => {
      const markdown = readFileSync(
        new URL(`../../src/content/projects/${id}.md`, import.meta.url),
        "utf8",
      );
      const body = markdown.replace(/^---[\s\S]*?\n---\n/, "");
      const firstParagraph = body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .find((p) => p && !/^[#>\-*<]/.test(p));
      expect(firstParagraph).toBeTruthy();
      // Markdown renders straight quotes as curly ones.
      const straighten = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
      const plain = firstParagraph!.replace(/[*_`]/g, "").replace(/\s+/g, " ");
      expect(straighten(text(builtPage(`/projects/${id}/`).querySelector("main")))).toContain(
        plain,
      );
    },
  );
});

describe("Deep Dive Panels", () => {
  it.each(["roborebels", "baja", "ftc-event-viewer"])(
    "%s sets its Body Text in solid Panels, one per subheading, each heading inside its border",
    (id) => {
      const body = builtPage(`/projects/${id}/`).querySelector("main .body-text")!;
      for (const block of body.querySelectorAll(":scope > *:not(figure)"))
        expect(block.getAttribute("data-panel"), block.outerHTML.slice(0, 60)).toBe("solid");
      for (const h2 of body.querySelectorAll("h2")) {
        expect(h2.parentElement!.getAttribute("data-panel")).toBe("solid");
        expect(h2.parentElement!.firstElementChild).toBe(h2);
      }
      expect(body.querySelectorAll(":scope > [data-panel]").length).toBeGreaterThan(0);
    },
  );
});

describe("Deep Dive Frames", () => {
  it.each(["roborebels", "baja", "ftc-event-viewer"])(
    "%s has Frame slots inside its Body Text",
    (id) => {
      const frames = builtPage(`/projects/${id}/`).querySelectorAll(
        "main .body-text figure.frame .frame-slot",
      );
      expect(frames.length).toBeGreaterThan(0);
    },
  );

  it.each(["roborebels", "baja", "ftc-event-viewer"])(
    "%s shows, for each missing photo or video, the file it wants",
    (id) => {
      for (const frame of builtPage(`/projects/${id}/`).querySelectorAll("figure.frame")) {
        const slot = frame.getAttribute("data-frame");
        const media = frame.querySelector("img, video");
        if (media) {
          expect(media.getAttribute("src")).toMatch(new RegExp(`^/media/${id}/${slot}\\.`));
          expect(media.getAttribute("alt") ?? media.getAttribute("aria-label")).toBeTruthy();
        } else {
          expect(text(frame.querySelector(".placeholder"))).toContain(
            `public/media/${id}/${slot}.jpg`,
          );
        }
      }
    },
  );

  it.each(["roborebels", "baja", "ftc-event-viewer"])(
    "%s marks each Frame's slot as a Panel: solid round its media, dashed while it's a Placeholder",
    (id) => {
      for (const frame of builtPage(`/projects/${id}/`).querySelectorAll("figure.frame")) {
        const slot = frame.querySelector(".frame-slot");
        const media = frame.querySelector("img, video");
        expect(slot?.getAttribute("data-panel")).toBe(media ? "solid" : "dashed");
      }
    },
  );

  it("places a Frame where its marker is in the Markdown", () => {
    const body = builtPage("/projects/roborebels/").querySelector(".body-text");
    const order = [...(body?.children ?? [])].map(
      (el) => el.getAttribute("data-frame") ?? text(el.querySelector(":scope > h2")),
    );
    expect(order.indexOf("robot")).toBeLessThan(order.indexOf("Results"));
    expect(order.indexOf("match")).toBeGreaterThan(order.indexOf("Results"));
    expect(order.indexOf("match")).toBeLessThan(order.indexOf("Mentoring"));
  });
});

describe("Panels", () => {
  it("every Experience Entry is a solid Panel", () => {
    const entries = builtPage("/experience/").querySelectorAll("main article");
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (const entry of entries) expect(entry.getAttribute("data-panel")).toBe("solid");
  });

  it("every block on About is a Panel with its heading inside, About me dashed while it's a Placeholder", () => {
    const page = builtPage("/about/");
    const headings = [...page.querySelectorAll("main h2")];
    expect(headings.map(text)).toEqual([
      "Education",
      "About me",
      "Languages",
      "Skills",
      "Activities",
    ]);
    for (const h2 of headings) {
      const panel = h2.parentElement!;
      const placeholder = panel.querySelector(".placeholder") !== null;
      expect(panel.getAttribute("data-panel"), text(h2)).toBe(placeholder ? "dashed" : "solid");
      expect(panel.firstElementChild, text(h2)).toBe(h2);
    }
  });

  describe("Project Entries", () => {
    const page = builtPage("/projects/");
    const entries = [...page.querySelectorAll("main article")];
    const byId = (id: string) => page.getElementById(id);
    const named = (el: Element, attr: string) =>
      (el.getAttribute(attr) ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => text(byId(id)))
        .join(" ");

    it.each([
      ["FTC RoboRebels", "/projects/roborebels/"],
      ["Baja fuel-level estimator", "/projects/baja/"],
      ["FTC Event Viewer", "/projects/ftc-event-viewer/"],
    ])("%s is one Button Panel link to its Deep Dive, named for it", (title, href) => {
      const entry = entries.find((e) => text(e.querySelector("h2")) === title)!;
      const links = entry.querySelectorAll("a");
      expect(links).toHaveLength(1);
      const [link] = links;
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("data-panel")).toBe("button");
      // The whole Entry is inside the link.
      expect(link.querySelector("h2")).not.toBeNull();
      expect(link.querySelector("ul")).not.toBeNull();
      expect(named(link, "aria-labelledby")).toBe(`${title} Read the story`);
      // The tools and points are its description, so they're still heard.
      expect(named(link, "aria-describedby")).toContain(text(entry.querySelector("ul li")));
    });

    it("an Entry with no Deep Dive is a solid Panel, its own link (if any) inside it", () => {
      const others = entries.filter((e) => !e.querySelector("[data-panel='button']"));
      expect(others.map((e) => text(e.querySelector("h2")))).toEqual([
        "Humanoid robot",
        "AI & Machine Learning",
        "Homelab",
        "Console & GPU Repair",
      ]);
      for (const entry of others) expect(entry.getAttribute("data-panel")).toBe("solid");
      expect(others[1].querySelector("a")?.getAttribute("href")).toBe(
        "https://github.com/mumtez/AIfeb14",
      );
    });

    it("leaves the FTC Event Viewer's own site to its Deep Dive, which links it", () => {
      const viewer = builtPage("/projects/ftc-event-viewer/").querySelector("main");
      const hrefs = [...(viewer?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
      expect(hrefs).toContain("https://ftc.aburustum.com");
    });
  });

  it.each(SECTIONS)(
    "%s marks Panels only with a known kind, and never one inside another",
    (url) => {
      const page = builtPage(url);
      for (const panel of page.querySelectorAll("[data-panel]")) {
        expect(["solid", "dashed", "button"]).toContain(panel.getAttribute("data-panel"));
        expect(panel.parentElement?.closest("[data-panel]"), url).toBeNull();
        expect(panel.closest("main"), url).not.toBeNull();
      }
    },
  );
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

  it.skipIf(privateTerms.length === 0)(
    "no built page contains the home town or phone number",
    () => {
      for (const { path, html } of pages) {
        const page = squash(html);
        for (const term of privateTerms)
          expect(page.includes(term), `${path} contains a private term`).toBe(false);
      }
    },
  );
});

describe(`the test-only Section ${TEST_SECTION} (in test builds only)`, () => {
  const doc = builtPage(TEST_SECTION);
  const main = doc.querySelector("main")!;

  it("always has a dashed Placeholder Panel, an empty Frame and a solid Panel", () => {
    const placeholder = main.querySelector(":scope > .placeholder");
    expect(placeholder?.getAttribute("data-panel")).toBe("dashed");
    expect(text(placeholder)).toMatch(/^Placeholder:/);
    const frame = main.querySelector("figure.frame .frame-slot");
    expect(frame?.getAttribute("data-panel")).toBe("dashed");
    expect(frame?.querySelector("img, video")).toBeNull();
    expect(frame?.querySelector(".placeholder")).not.toBeNull();
    expect(main.querySelectorAll('section[data-panel="solid"]').length).toBeGreaterThan(0);
  });

  it("has one h1, and isn't in the nav or the Grid's content", () => {
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    const hrefs = [...doc.querySelectorAll("nav a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/about/", "/experience/", "/projects/", "/contact/"]);
    expect(doc.querySelectorAll('nav a[aria-current="page"]')).toHaveLength(0);
    const content = JSON.parse(doc.querySelector("script#grid-content")?.textContent ?? "") as {
      sections: { path: string }[];
    };
    expect(content.sections.map((s) => s.path).sort()).toEqual([...SECTIONS].sort());
  });

  it("isn't linked from any real Section", () => {
    for (const url of SECTIONS)
      for (const a of builtPage(url).querySelectorAll("a"))
        expect(a.getAttribute("href"), url).not.toContain(TEST_SECTION.slice(0, -1));
  });
});

describe("Placeholders", () => {
  const list = readFileSync(new URL("../../PLACEHOLDERS.md", import.meta.url), "utf8").replace(
    /\s+/g,
    " ",
  );
  const placeholders = allBuiltHtml().flatMap(({ path, html }) =>
    [...parseHTML(html).document.querySelectorAll(".placeholder")].map((el) => ({ path, el })),
  );
  // The test-only Section's Placeholders aren't Andrew's to fill, so aren't listed.
  const testOnlyPage = builtPath(TEST_SECTION).href;
  const isTestOnly = ({ path }: { path: string }) => new URL(path, DIST).href === testOnlyPage;
  const andrews = placeholders.filter((p) => !isTestOnly(p));

  it("the test build shows placeholders (the test-only Section always has some)", () => {
    expect(placeholders.filter(isTestOnly).length).toBeGreaterThan(0);
  });

  it("every placeholder is visibly labelled", () => {
    for (const { path, el } of placeholders) expect(text(el), path).toMatch(/^Placeholder:/);
  });

  it("every placeholder is a dashed Panel, or fills one (a Frame waiting for its media)", () => {
    for (const { path, el } of placeholders)
      expect(el.closest("[data-panel]")?.getAttribute("data-panel"), path).toBe("dashed");
  });

  it("every placeholder is listed in PLACEHOLDERS.md", () => {
    for (const { path, el } of andrews) {
      const note = text(el).replace(/^Placeholder:\s*/, "");
      expect(list, `${path}: "${note}"`).toContain(note);
    }
  });
});
