import { describe, expect, it } from "vitest";
import { lifeStill } from "./life-still";
import { allLive } from "./test-support";

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;

describe("lifeStill: the frozen Life pattern behind the Plain View", () => {
  it("is the same pattern every time for a viewport, so it doesn't reshuffle on reload", () => {
    const a = allLive(lifeStill({ width: 120, height: 80 })).map(key);
    const b = allLive(lifeStill({ width: 120, height: 80 })).map(key);
    expect(a).toEqual(b);
  });

  it("has settled Life in it: neither empty nor raw soup", () => {
    const still = lifeStill({ width: 120, height: 80 });
    const live = allLive(still).length;
    expect(live).toBeGreaterThan(120 * 80 * 0.01);
    expect(live).toBeLessThan(120 * 80 * 0.2);
  });

  it("is frozen: it doesn't change unless it's made again", () => {
    const still = lifeStill({ width: 60, height: 40 });
    const before = allLive(still).map(key);
    expect(allLive(still).map(key)).toEqual(before);
  });

  it("pins nothing, so the Plain View's own heading carries the content", () => {
    const still = lifeStill({ width: 60, height: 40 });
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 60; x++) expect(still.isPinned(x, y)).toBe(false);
  });
});
