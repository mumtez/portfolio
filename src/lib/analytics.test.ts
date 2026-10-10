import { afterEach, describe, expect, it, vi } from "vitest";
import { countPageView } from "./analytics";

describe("countPageView", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("counts a view of the given Section path with GoatCounter", () => {
    const count = vi.fn();
    vi.stubGlobal("window", { goatcounter: { count } });
    countPageView("/projects/baja/");
    expect(count).toHaveBeenCalledWith({ path: "/projects/baja/" });
  });

  it("does nothing while GoatCounter hasn't loaded (or is blocked)", () => {
    vi.stubGlobal("window", {});
    expect(() => countPageView("/about/")).not.toThrow();
  });

  it("does nothing outside a browser", () => {
    expect(() => countPageView("/about/")).not.toThrow();
  });
});
