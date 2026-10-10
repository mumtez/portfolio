import { existsSync, readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { GOATCOUNTER_SITE_CODE } from "../../src/lib/analytics";

const SITE = "https://aburustum.com";
const DIST = new URL("../../dist/", import.meta.url);

const SECTIONS = [
  "/",
  "/about/",
  "/experience/",
  "/projects/",
  "/projects/roborebels/",
  "/projects/baja/",
  "/projects/ftc-event-viewer/",
  "/contact/",
];

/** The built file for a URL path on this site, e.g. `/about/` → `dist/about/index.html`. */
function distFile(urlPath: string): URL {
  const path = urlPath.replace(/^\//, "");
  return new URL(path === "" || path.endsWith("/") ? `${path}index.html` : path, DIST);
}

function builtPage(urlPath: string): Document {
  return parseHTML(readFileSync(distFile(urlPath), "utf8")).document;
}

function meta(doc: Document, key: string): string | null | undefined {
  return doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute("content");
}

/** The width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe.each(SECTIONS)("Section %s link preview", (url) => {
  const doc = builtPage(url);
  const title = doc.querySelector("title")?.textContent;
  const description = meta(doc, "description");

  it("has a title and description", () => {
    expect(title).toMatch(/Andrew Aburustum/);
    expect(description).toBeTruthy();
  });

  it("has a canonical URL on aburustum.com", () => {
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(`${SITE}${url}`);
  });

  it("has Open Graph tags matching its title and description", () => {
    expect(meta(doc, "og:title")).toBe(title);
    expect(meta(doc, "og:description")).toBe(description);
    expect(meta(doc, "og:url")).toBe(`${SITE}${url}`);
    expect(meta(doc, "og:type")).toBe("website");
    expect(meta(doc, "og:site_name")).toBe("Andrew Aburustum");
  });

  it("has Twitter card tags matching its title and description", () => {
    expect(meta(doc, "twitter:card")).toBe("summary_large_image");
    expect(meta(doc, "twitter:title")).toBe(title);
    expect(meta(doc, "twitter:description")).toBe(description);
  });

  it("has a preview image that exists in the built site", () => {
    const image = meta(doc, "og:image");
    expect(image).toMatch(new RegExp(`^${SITE}/`));
    expect(meta(doc, "twitter:image")).toBe(image);
    expect(meta(doc, "og:image:alt")).toBeTruthy();
    expect(meta(doc, "twitter:image:alt")).toBe(meta(doc, "og:image:alt"));

    const path = new URL(image!).pathname;
    expect(existsSync(distFile(path)), path).toBe(true);
    const size = pngSize(readFileSync(distFile(path)));
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(meta(doc, "og:image:width")).toBe("1200");
    expect(meta(doc, "og:image:height")).toBe("630");
  });

  it("counts a GoatCounter view", () => {
    const scripts = [...doc.querySelectorAll("script[data-goatcounter]")];
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute("data-goatcounter")).toBe(`https://${GOATCOUNTER_SITE_CODE}.goatcounter.com/count`);
    expect(scripts[0].getAttribute("src")).toBe("https://gc.zgo.at/count.js");
    expect(scripts[0].hasAttribute("async")).toBe(true);
  });
});

describe("Resume", () => {
  const main = builtPage("/contact/").querySelector("main");
  const link = [...(main?.querySelectorAll("a") ?? [])].find((a) => /\.pdf$/.test(a.getAttribute("href") ?? ""));

  it("Contact links a resume PDF to download", () => {
    expect(link?.textContent).toMatch(/resume/i);
    expect(link?.hasAttribute("download")).toBe(true);
  });

  it("the resume link resolves to a PDF in the built site", () => {
    const href = link!.getAttribute("href")!;
    expect(href).toMatch(/^\//);
    const file = distFile(href);
    expect(existsSync(file), href).toBe(true);
    expect(readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
