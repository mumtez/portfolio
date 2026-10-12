import type { Page } from "@playwright/test";
import { expect, expectGrid, main, navLink, SECTIONS, test } from "./fixtures";

// The nav is the five top-level Sections everywhere; Deep Dives are reached from their
// Project Entries. No Section but Home draws a heading in cells: the underlined nav
// Button says where you are. Every Section keeps one h1, hidden on top-level Sections
// and shown at the top of the Body Text on a Deep Dive.

const NAV = ["Home", "About", "Experience", "Projects", "Contact"];
const isDeepDive = (path: string) => path.startsWith("/projects/") && path !== "/projects/";

const nav = (page: Page) => page.getByRole("navigation", { name: "Sections" });

/** Whether the h1 is out of sight: clipped to (at most) a single pixel. */
async function isVisuallyHidden(page: Page): Promise<boolean> {
  const box = await main(page).locator("h1").boundingBox();
  return box === null || (box.width <= 1 && box.height <= 1);
}

/** The bottom edge of the nav's lowest link, in CSS px. */
async function navBottom(page: Page): Promise<number> {
  const boxes = await Promise.all(NAV.map((label) => navLink(page, label).boundingBox()));
  return Math.max(...boxes.map((b) => (b ? b.y + b.height : 0)));
}

for (const path of SECTIONS.filter((p) => p !== "/")) {
  test.describe(path, () => {
    test("with the Grid on: a five-link nav, and the Body Text right below it", async ({
      page,
    }) => {
      await page.goto(path);
      await expectGrid(page, true);
      await expect(main(page)).toHaveCSS("opacity", "1");
      await expect(nav(page).getByRole("link")).toHaveText(NAV);

      expect(await isVisuallyHidden(page)).toBe(!isDeepDive(path));
      const bottom = await navBottom(page);
      const top = (await main(page).boundingBox())!.y;
      expect(top).toBeGreaterThanOrEqual(bottom);
      // Directly below: the Body Text gap, not a drawn heading's worth of rows.
      expect(top - bottom).toBeLessThan(40);

      if (isDeepDive(path)) {
        await expect(navLink(page, "Projects")).toHaveAttribute("aria-current", "true");
        const h1 = (await main(page).locator("h1").boundingBox())!;
        expect(h1.y).toBeGreaterThanOrEqual(top);
      }
    });

    test.describe("in the Plain View", () => {
      test.use({ reducedMotion: "reduce" });

      test("a five-link nav, and the h1 hidden unless it's a Deep Dive", async ({ page }) => {
        await page.goto(path);
        await expectGrid(page, false);
        await expect(nav(page).getByRole("link")).toHaveText(NAV);
        expect(await isVisuallyHidden(page)).toBe(!isDeepDive(path));
      });
    });
  });
}

test("Home keeps its name as the h1, drawn in cells with the Grid on", async ({ page }) => {
  await page.goto("/");
  await expectGrid(page, true);
  await expect(nav(page).getByRole("link")).toHaveText(NAV);
  await expect(main(page).locator("h1")).toHaveText("Andrew Aburustum");
  expect(await isVisuallyHidden(page)).toBe(true);
});

test("a hidden h1 is still announced on arrival: it takes focus after a Transition", async ({
  page,
}) => {
  await page.goto("/");
  await navLink(page, "About").click();
  await expect(page).toHaveURL("/about/");
  await expect(main(page).locator("h1")).toBeFocused();
  expect(await isVisuallyHidden(page)).toBe(true);
});
