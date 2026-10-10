import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { resolveSimulation, resolveTheme, safeStore, THEME_SCRIPT } from "./preferences";

/** Run the inline theme script against a stand-in window; returns the `data-theme` it set on <html>. */
function runThemeScript({ stored, systemLight, storageThrows = false }: {
  stored: string | null;
  systemLight: boolean;
  storageThrows?: boolean;
}): string | undefined {
  const dataset: Record<string, string> = {};
  const window = {
    get localStorage() {
      if (storageThrows) throw new DOMException("denied", "SecurityError");
      return { getItem: (key: string) => (key === "theme" ? stored : null) };
    },
    matchMedia: (query: string) => ({ matches: query === "(prefers-color-scheme: light)" && systemLight }),
  };
  runInNewContext(THEME_SCRIPT, { window, document: { documentElement: { dataset } } });
  return dataset.theme;
}

describe("the theme script, run before first paint", () => {
  it.each([
    [null, true],
    [null, false],
    ["dark", true],
    ["light", false],
    ["purple", true],
  ])("sets the same theme as resolveTheme (stored %s, system light %s)", (stored, systemLight) => {
    expect(runThemeScript({ stored, systemLight })).toBe(resolveTheme(stored, { systemLight }));
  });

  it("falls back to the system setting when storage throws", () => {
    expect(runThemeScript({ stored: "dark", systemLight: true, storageThrows: true })).toBe("light");
  });
});

describe("theme", () => {
  it("follows the system setting when nothing is stored", () => {
    expect(resolveTheme(null, { systemLight: true })).toBe("light");
    expect(resolveTheme(null, { systemLight: false })).toBe("dark");
  });

  it("lets a stored choice override the system setting", () => {
    expect(resolveTheme("dark", { systemLight: true })).toBe("dark");
    expect(resolveTheme("light", { systemLight: false })).toBe("light");
  });

  it("ignores a stored value it doesn't recognise", () => {
    expect(resolveTheme("purple", { systemLight: true })).toBe("light");
  });
});

describe("simulation", () => {
  it("is on by default", () => {
    expect(resolveSimulation(null, { reducedMotion: false })).toBe(true);
  });

  it("defaults to off (Plain View) under reduced motion", () => {
    expect(resolveSimulation(null, { reducedMotion: true })).toBe(false);
  });

  it("follows a stored choice, even under reduced motion", () => {
    expect(resolveSimulation("off", { reducedMotion: false })).toBe(false);
    expect(resolveSimulation("on", { reducedMotion: true })).toBe(true);
  });

  it("ignores a stored value it doesn't recognise", () => {
    expect(resolveSimulation("maybe", { reducedMotion: true })).toBe(false);
  });
});

describe("safe storage", () => {
  function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
      key: () => null,
      get length() {
        return data.size;
      },
    };
  }

  it("reads back what it stored", () => {
    const storage = memoryStorage();
    const store = safeStore(() => storage);
    store.set("theme", "light");
    expect(store.get("theme")).toBe("light");
    expect(store.get("simulation")).toBeNull();
  });

  it("is harmless when storage can't even be reached", () => {
    const store = safeStore(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => store.set("theme", "light")).not.toThrow();
    expect(store.get("theme")).toBeNull();
  });

  it("is harmless when reads and writes throw", () => {
    const broken = memoryStorage();
    broken.getItem = () => {
      throw new Error("blocked");
    };
    broken.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    const store = safeStore(() => broken);
    expect(() => store.set("theme", "light")).not.toThrow();
    expect(store.get("theme")).toBeNull();
  });
});
