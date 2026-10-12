import type { Locator, Page } from "@playwright/test";
import { expect, expectSection, expectTransition, main, test } from "./fixtures";

// Project Entries are Button Panels: one real link wrapping each Entry that has a Deep
// Dive, drawn in the Grid as a pinned border that decays under Life on hover and focus,
// then pins again, like the nav's Buttons.

const baja = (page: Page) =>
  main(page).getByRole("link", { name: "Baja fuel-level estimator Read the story" });

/** Whether the Cells on the link's border are pinned: its top-left corner and the middle of its top edge. */
const borderPinned = (link: Locator) =>
  link.evaluate((el) => {
    type Hooks = {
      gridShapes: () => { cellPx: number };
      gridCell: (x: number, y: number) => { pinned: boolean };
    };
    const { gridShapes, gridCell } = window as unknown as Hooks;
    const { cellPx } = gridShapes();
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left / cellPx);
    const y = Math.round(r.top / cellPx);
    const middle = Math.round((r.left + r.right) / 2 / cellPx);
    return gridCell(x, y).pinned && gridCell(middle, y).pinned;
  });

async function openProjects(page: Page): Promise<void> {
  await page.goto("/projects/");
  await expectSection(page, "/projects/", "Projects");
}

test.describe("Project Entries in the Grid", () => {
  test("each Entry with a Deep Dive is one link, its border pinned round it", async ({ page }) => {
    await openProjects(page);
    const entries = main(page).locator("article");
    await expect(entries).toHaveCount(6);
    for (const name of ["FTC RoboRebels", "Baja fuel-level estimator", "FTC Event Viewer"])
      await expect(
        main(page).getByRole("link", { name: `${name} Read the story`, exact: true }),
      ).toHaveCount(1);
    await baja(page).scrollIntoViewIfNeeded();
    await expect.poll(() => borderPinned(baja(page))).toBe(true);
  });

  test("hovering an Entry decays its border, then it pins again", async ({ page, hasTouch }) => {
    test.skip(hasTouch, "no hover on a touch screen");
    await openProjects(page);
    const link = baja(page);
    await link.scrollIntoViewIfNeeded();
    await expect.poll(() => borderPinned(link)).toBe(true);
    await link.hover();
    await expect.poll(() => borderPinned(link)).toBe(false);
    await expect.poll(() => borderPinned(link)).toBe(true);
    // Only that Entry's border.
    const roborebels = main(page).getByRole("link", { name: "FTC RoboRebels Read the story" });
    expect(await borderPinned(roborebels)).toBe(true);
  });

  test("focusing an Entry decays its border, with a focus ring round it", async ({ page }) => {
    await openProjects(page);
    const link = baja(page);
    await link.focus();
    await expect.poll(() => borderPinned(link)).toBe(false);
    await expect.poll(() => borderPinned(link)).toBe(true);
    await expect(link).toHaveCSS("outline-style", "solid");
  });

  test("a click opens the Deep Dive through a Transition", async ({ page }) => {
    await openProjects(page);
    await expectTransition(page, async () => {
      await baja(page).click();
      await expectSection(page, "/projects/baja/", "Baja fuel-level estimator");
    });
  });

  for (const key of ["Enter", "Space"]) {
    test(`${key} opens the Deep Dive through a Transition`, async ({ page }) => {
      await openProjects(page);
      await expectTransition(page, async () => {
        await baja(page).focus();
        await page.keyboard.press(key);
        await expectSection(page, "/projects/baja/", "Baja fuel-level estimator");
      });
    });
  }
});

test.describe("Project Entries in the Plain View", () => {
  test.use({ reducedMotion: "reduce" });

  test("an Entry is a bordered link, set for reading, that opens its Deep Dive", async ({
    page,
  }) => {
    await openProjects(page);
    const link = baja(page);
    const style = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      const h = getComputedStyle(el.querySelector("li")!);
      return {
        display: s.display,
        border: `${s.borderTopWidth} ${s.borderTopStyle}`,
        decoration: h.textDecorationLine,
        textColor: h.color,
        bodyColor: getComputedStyle(document.body).color,
      };
    });
    expect(style).toMatchObject({ display: "block", border: "1px solid", decoration: "none" });
    expect(style.textColor).toBe(style.bodyColor);
    await link.click();
    await expectSection(page, "/projects/baja/", "Baja fuel-level estimator");
  });
});
