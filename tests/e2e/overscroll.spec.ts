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

test("with the Grid on, neither the scroll box nor the page bounces", async ({ page }) => {
  await page.goto("/projects/baja/");
  await expectGrid(page, true);
  await expectSection(page, "/projects/baja/", "Baja fuel-level estimator");
  expect(await overscroll(page)).toEqual(["none", "none"]);
});

test("the Plain View keeps the browser's own overscroll", async ({ page }) => {
  await page.goto("/projects/baja/");
  await expectGrid(page, true);
  await toggle(page, "simulation").click();
  await expectGrid(page, false);
  expect(await overscroll(page)).toEqual(["auto", "auto"]);
});

test.describe("under reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the Plain View keeps the browser's own overscroll", async ({ page }) => {
    await page.goto("/projects/baja/");
    await expectGrid(page, false);
    await expect(main(page)).toBeVisible();
    expect(await overscroll(page)).toEqual(["auto", "auto"]);
  });
});
