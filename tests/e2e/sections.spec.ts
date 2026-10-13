import {
  expect,
  expectGrid,
  expectNoSidewaysScroll,
  main,
  SECTIONS,
  TEST_SECTION,
  test,
} from "./fixtures";

// Every Section loads with no errors (the fixtures fail any test that logs one) and fits
// the window's width, at 390px on the iPhone projects.
for (const path of [...SECTIONS, TEST_SECTION]) {
  test.describe(path, () => {
    test("fits the width with the Grid on", async ({ page }) => {
      await page.goto(path);
      await expectGrid(page, true);
      await expect(main(page)).toHaveCSS("opacity", "1");
      await expectNoSidewaysScroll(page);
    });

    test.describe("in the Plain View", () => {
      // Reduced motion leaves the simulation off unless the visitor switches it on.
      test.use({ reducedMotion: "reduce" });

      test("fits the width", async ({ page }) => {
        await page.goto(path);
        await expect(page.locator("button[data-toggle]").first()).toBeVisible();
        await expectGrid(page, false);
        await expectNoSidewaysScroll(page);
      });
    });
  });
}
