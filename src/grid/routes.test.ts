import { describe, expect, it } from "vitest";
import { sectionPath, transitionPathFor, type LinkClick } from "./routes";
import { TEST_CONTENT } from "./test-support";

describe("sectionPath", () => {
  it.each([
    ["/", "/"],
    ["", "/"],
    ["/index.html", "/"],
    ["/about", "/about/"],
    ["/about/", "/about/"],
    ["/projects/baja", "/projects/baja/"],
    ["/projects/baja/index.html", "/projects/baja/"],
  ])("reads %j as the Section path %j", (pathname, path) => {
    expect(sectionPath(pathname)).toBe(path);
  });
});

describe("transitionPathFor: which link clicks become Transitions", () => {
  const here = new URL("https://aburustum.com/about/");
  const click = (href: string, more: Partial<LinkClick> = {}): LinkClick => ({
    href,
    target: "",
    download: false,
    button: 0,
    modified: false,
    ...more,
  });

  it("a plain click on a link to another Section", () => {
    expect(transitionPathFor(click("/projects/"), here, TEST_CONTENT)).toBe("/projects/");
    expect(transitionPathFor(click("https://aburustum.com/projects/baja"), here, TEST_CONTENT)).toBe("/projects/baja/");
    expect(transitionPathFor(click("../"), here, TEST_CONTENT)).toBe("/");
  });

  it("not a link to the Section already showing", () => {
    expect(transitionPathFor(click("/about/"), here, TEST_CONTENT)).toBeUndefined();
    expect(transitionPathFor(click("#languages"), here, TEST_CONTENT)).toBeUndefined();
  });

  it("not a link off the site, to a file, or to a page the Grid doesn't know", () => {
    expect(transitionPathFor(click("https://github.com/mumtez"), here, TEST_CONTENT)).toBeUndefined();
    expect(transitionPathFor(click("mailto:aaburustum@olin.edu"), here, TEST_CONTENT)).toBeUndefined();
    expect(transitionPathFor(click("/resume.pdf"), here, TEST_CONTENT)).toBeUndefined();
    expect(transitionPathFor(click("/nowhere/"), here, TEST_CONTENT)).toBeUndefined();
  });

  it("not a click the browser should handle itself", () => {
    expect(transitionPathFor(click("/projects/", { modified: true }), here, TEST_CONTENT)).toBeUndefined();
    expect(transitionPathFor(click("/projects/", { button: 1 }), here, TEST_CONTENT)).toBeUndefined();
    expect(transitionPathFor(click("/projects/", { target: "_blank" }), here, TEST_CONTENT)).toBeUndefined();
    expect(transitionPathFor(click("/projects/", { download: true }), here, TEST_CONTENT)).toBeUndefined();
  });
});
