import { describe, expect, it } from "vitest";
import { frameMedia, panelBlocks, placeFrames } from "./frames";

describe("a Frame's media", () => {
  it("is a photo when a picture file named after the slot is there", () => {
    expect(frameMedia("baja", "pcb", ["pcb.jpg", "other.png"])).toEqual({
      kind: "image",
      src: "/media/baja/pcb.jpg",
    });
  });

  it.each(["png", "jpeg", "webp", "avif", "gif", "JPG"])("accepts .%s photos", (ext) => {
    expect(frameMedia("baja", "pcb", [`pcb.${ext}`])?.kind).toBe("image");
  });

  it.each(["mp4", "webm", "MOV"])("is a video for a .%s file", (ext) => {
    expect(frameMedia("roborebels", "match", [`match.${ext}`])).toEqual({
      kind: "video",
      src: `/media/roborebels/match.${ext}`,
    });
  });

  it("is missing when no file matches the slot", () => {
    expect(frameMedia("baja", "pcb", ["pcb-old.jpg", "car.jpg", "pcb.txt"])).toBeUndefined();
  });

  it("prefers a video to a photo, so a poster-like still can sit beside it", () => {
    expect(frameMedia("baja", "car", ["car.jpg", "car.mp4"])?.kind).toBe("video");
  });

  it("escapes file names for the URL", () => {
    expect(frameMedia("baja", "pcb", ["pcb.JPG"])?.src).toBe("/media/baja/pcb.JPG");
    expect(frameMedia("my dive", "a b", ["a b.png"])?.src).toBe("/media/my%20dive/a%20b.png");
  });
});

describe("placing Frames in the Body Text", () => {
  const html = "<p>One.</p>\n<!-- frame: robot -->\n<h2>Results</h2>\n<p>Two.</p>";

  it("puts each Frame where its marker is", () => {
    expect(placeFrames(html, ["robot"])).toEqual([
      { html: "<p>One.</p>\n" },
      { frame: "robot" },
      { html: "\n<h2>Results</h2>\n<p>Two.</p>" },
    ]);
  });

  it("puts Frames without a marker after the Body Text, in order", () => {
    expect(placeFrames("<p>One.</p>", ["a", "b"])).toEqual([
      { html: "<p>One.</p>" },
      { frame: "a" },
      { frame: "b" },
    ]);
  });

  it("tolerates spacing inside the marker", () => {
    expect(placeFrames("<!--frame:robot-->", ["robot"])).toEqual([{ frame: "robot" }]);
  });

  it("refuses a marker for a Frame the Deep Dive doesn't list", () => {
    expect(() => placeFrames("<!-- frame: nope -->", ["robot"])).toThrow(/nope/);
  });

  it("refuses a Frame placed twice", () => {
    expect(() => placeFrames("<!-- frame: a --><!-- frame: a -->", ["a"])).toThrow(/twice/);
  });
});

describe("the Panels a piece of Body Text is set in", () => {
  it("are the text before the first subheading, then one per subheading", () => {
    const html =
      '<p>One.</p>\n<h2 id="results">Results</h2>\n<ul><li>Won.</li></ul>\n<h2>More</h2><p>Two.</p>';
    expect(panelBlocks(html)).toEqual([
      "<p>One.</p>\n",
      '<h2 id="results">Results</h2>\n<ul><li>Won.</li></ul>\n',
      "<h2>More</h2><p>Two.</p>",
    ]);
  });

  it("leave out blank stretches, such as the gap between a Frame and a subheading", () => {
    expect(panelBlocks("\n  \n<h2>Results</h2><p>Two.</p>")).toEqual([
      "<h2>Results</h2><p>Two.</p>",
    ]);
    expect(panelBlocks("\n")).toEqual([]);
  });

  it("split only at subheadings, not at deeper headings", () => {
    expect(panelBlocks("<p>One.</p><h3>Detail</h3><p>Two.</p>")).toEqual([
      "<p>One.</p><h3>Detail</h3><p>Two.</p>",
    ]);
  });
});
