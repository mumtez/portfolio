import type { Page } from "@playwright/test";
import { expect, expectGrid, expectSection, main, test, toggle } from "./fixtures";

// With the Grid on, neither the Body Text's scroll box nor the page bounces past its
// scroll ends: on iPhone the rubber band moves the text without changing the scroll
// position the Cells follow. The Plain View keeps the browser's own scrolling.

/** `overscroll-behavior` as computed on the root and on the Section's `main`. */
const overscroll = (page: Page) =>
  page.evaluate(() =>
    [document.documentElement, document.querySelector("main")!].map(
      (el) => getComputedStyle(el).overscrollBehavior,
    ),
  );

test("with the Grid on, neither the Body Text's scroll box nor the page bounces", async ({
  page,
}) => {
  await page.goto("/projects/baja/");
  await expectGrid(page, true);
  await expectSection(page, "/projects/baja/", "Baja fuel-level estimator");
  expect(await overscroll(page)).toEqual(["none", "none"]);
});

const PLAIN_VIEWS = [
  {
    why: "simulation toggled off",
    use: {},
    open: async (page: Page) => {
      await page.goto("/projects/baja/");
      await expectGrid(page, true);
      await toggle(page, "simulation").click();
    },
  },
  {
    why: "reduced motion",
    use: { reducedMotion: "reduce" as const },
    open: (page: Page) => page.goto("/projects/baja/"),
  },
];

for (const { why, use, open } of PLAIN_VIEWS) {
  test.describe(`the Plain View (${why})`, () => {
    test.use(use);

    test("keeps the browser's own overscroll", async ({ page }) => {
      await open(page);
      await expectGrid(page, false);
      await expect(main(page)).toBeVisible();
      expect(await overscroll(page)).toEqual(["auto", "auto"]);
    });
  });
}
