import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

/** Where `astro preview` serves the built site for the browser tests. */
const PORT = Number(process.env.E2E_PORT ?? 4329);

/** A desktop window, and an iPhone's: 390px wide at 3× with touch. */
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  iphone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
} satisfies Record<string, PlaywrightTestConfig["use"]>;

/** Chromium, and WebKit since every iPhone browser is WebKit. */
const ENGINES = ["chromium", "webkit"] as const;

/**
 * Browser end-to-end tests against the built site (`npm run test:e2e` builds first), in
 * each engine at each viewport. Tests import from `tests/e2e/fixtures.ts`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: ENGINES.flatMap((browserName) =>
    Object.entries(VIEWPORTS).map(([size, use]) => ({
      name: `${browserName}-${size}`,
      use: { browserName, ...use },
    })),
  ),
  webServer: {
    command: `npx astro preview --port ${PORT} --ignore-lock`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
});
