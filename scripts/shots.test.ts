import { describe, expect, it } from "vitest";
import { parseShotsArgs, shotFile } from "./shots";

describe("a screenshot's file name", () => {
  it("is the path, viewport, theme and view", () => {
    expect(
      shotFile({ path: "/projects/baja/", viewport: "iphone", theme: "light", view: "plain" }),
    ).toBe(".shots/projects-baja-iphone-light-plain.png");
  });

  it("calls the root Section home", () => {
    expect(shotFile({ path: "/", viewport: "desktop", theme: "dark", view: "grid" })).toBe(
      ".shots/home-desktop-dark-grid.png",
    );
  });
});

describe("the shots command's arguments", () => {
  it("default to every path, viewport, theme and view, built as live", () => {
    expect(parseShotsArgs([])).toEqual({
      paths: [],
      viewports: ["desktop", "iphone"],
      themes: ["dark", "light"],
      views: ["grid", "plain"],
      placeholders: false,
    });
  });

  it("narrow the set with paths and flags", () => {
    expect(
      parseShotsArgs([
        "/about/",
        "--viewport",
        "iphone",
        "--theme=light",
        "--view",
        "plain",
        "/projects/baja/",
        "--placeholders",
      ]),
    ).toEqual({
      paths: ["/about/", "/projects/baja/"],
      viewports: ["iphone"],
      themes: ["light"],
      views: ["plain"],
      placeholders: true,
    });
  });

  it("take paths without their slashes", () => {
    expect(parseShotsArgs(["about", "projects/baja"]).paths).toEqual([
      "/about/",
      "/projects/baja/",
    ]);
  });

  it.each([
    [["--viewport", "ipad"], /--viewport must be desktop or iphone/],
    [["--theme", "blue"], /--theme must be dark or light/],
    [["--view", "both"], /--view must be grid or plain/],
    [["--colour", "red"], /--colour/],
  ])("reject %j", (argv, message) => {
    expect(() => parseShotsArgs(argv)).toThrow(message);
  });
});
