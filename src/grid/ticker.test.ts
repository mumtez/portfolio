import { describe, expect, it } from "vitest";
import { startTicker, type TickerHost } from "./ticker";

/** A stand-in for the browser: frames run only when `frame` is called, and the tab can be hidden. */
function fakeHost() {
  let callbacks = new Map<number, (t: number) => void>();
  let nextId = 1;
  let listeners: (() => void)[] = [];
  const host: TickerHost = {
    requestAnimationFrame(cb) {
      callbacks.set(nextId, cb);
      return nextId++;
    },
    cancelAnimationFrame(id) {
      callbacks.delete(id);
    },
    document: {
      hidden: false,
      addEventListener(_type, listener) {
        listeners.push(listener);
      },
      removeEventListener(_type, listener) {
        listeners = listeners.filter((l) => l !== listener);
      },
    },
  };
  return {
    host,
    /** Run every pending frame callback at time `t`. */
    frame(t: number) {
      const due = callbacks;
      callbacks = new Map();
      for (const cb of due.values()) cb(t);
    },
    setHidden(hidden: boolean) {
      (host.document as { hidden: boolean }).hidden = hidden;
      for (const l of listeners) l();
    },
    get pendingFrames() {
      return callbacks.size;
    },
    get listeners() {
      return listeners.length;
    },
  };
}

describe("startTicker", () => {
  it("ticks at most once per interval", () => {
    const browser = fakeHost();
    let ticks = 0;
    startTicker(() => ticks++, 100, browser.host);
    for (let t = 0; t <= 1000; t += 16) browser.frame(t);
    expect(ticks).toBeGreaterThanOrEqual(9);
    expect(ticks).toBeLessThanOrEqual(10);
  });

  it("stops ticking while the tab is hidden, and resumes without catching up", () => {
    const browser = fakeHost();
    let ticks = 0;
    startTicker(() => ticks++, 100, browser.host);
    for (let t = 0; t <= 500; t += 16) browser.frame(t);
    const before = ticks;

    browser.setHidden(true);
    expect(browser.pendingFrames).toBe(0);
    for (let t = 500; t <= 5000; t += 16) browser.frame(t);
    expect(ticks).toBe(before);

    browser.setHidden(false);
    browser.frame(60_000);
    browser.frame(60_016);
    expect(ticks).toBe(before + 1);
  });

  it("doesn't start while the tab is already hidden", () => {
    const browser = fakeHost();
    browser.setHidden(true);
    let ticks = 0;
    startTicker(() => ticks++, 100, browser.host);
    for (let t = 0; t <= 1000; t += 16) browser.frame(t);
    expect(ticks).toBe(0);
    browser.setHidden(false);
    browser.frame(1016);
    expect(ticks).toBe(1);
  });

  it("waits a full interval after a restart", () => {
    const browser = fakeHost();
    let ticks = 0;
    const ticker = startTicker(() => ticks++, 100, browser.host);
    browser.frame(0);
    expect(ticks).toBe(1);

    ticker.restart();
    browser.frame(150);
    browser.frame(240);
    expect(ticks).toBe(1);
    browser.frame(250);
    expect(ticks).toBe(2);
  });

  it("stops for good when stopped, even when the tab is shown again", () => {
    const browser = fakeHost();
    let ticks = 0;
    const ticker = startTicker(() => ticks++, 100, browser.host);
    browser.frame(0);
    ticker.stop();
    expect(browser.pendingFrames).toBe(0);
    browser.setHidden(true);
    browser.setHidden(false);
    for (let t = 100; t <= 1000; t += 16) browser.frame(t);
    expect(ticks).toBe(1);
  });

  it("stops listening for the tab's visibility when stopped", () => {
    const browser = fakeHost();
    startTicker(() => {}, 100, browser.host).stop();
    expect(browser.listeners).toBe(0);
  });

  it("doesn't double up if shown twice in a row", () => {
    const browser = fakeHost();
    startTicker(() => {}, 100, browser.host);
    browser.setHidden(false);
    browser.setHidden(false);
    expect(browser.pendingFrames).toBe(1);
  });
});
