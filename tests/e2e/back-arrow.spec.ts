import type { Locator, Page } from "@playwright/test";
import { expect, expectSection, expectTransition, main, test } from "./fixtures";

// Every Deep Dive opens with a way back to Projects at the top left, above its title. In
// the Grid it's a Button Panel with a left arrow drawn in Cells inside a pinned border
// that decays under Life on hover and focus; underneath it's a real link named "All
// projects". In Plain View and with JS off it's an ordinary "← All projects" link.

const DEEP_DIVES = [
  { path: "/projects/roborebels/", heading: "FTC RoboRebels" },
  { path: "/projects/baja/", heading: "Baja fuel-level estimator" },
  { path: "/projects/ftc-event-viewer/", heading: "FTC Event Viewer" },
];
const BAJA = DEEP_DIVES[1];

const back = (page: Page) => main(page).getByRole("link", { name: "All projects", exact: true });

/**
 * The link's Cells: whether every Cell on the edge of its box (rounded to Cells) is
 * pinned, whether any is, and how many Pinned Cells lie inside it (the arrow).
 */
const cells = (button: Locator) =>
  button.evaluate((el) => {
    const grid = window.gridTest!;
    const { cellPx } = grid.shapes();
    const r = el.getBoundingClientRect();
    const left = Math.round(r.left / cellPx);
    const top = Math.round(r.top / cellPx);
    const right = Math.round(r.right / cellPx) - 1;
    const bottom = Math.round(r.bottom / cellPx) - 1;
    const edge: boolean[] = [];
    for (let x = left; x <= right; x++)
      edge.push(grid.cell(x, top).pinned, grid.cell(x, bottom).pinned);
    for (let y = top + 1; y < bottom; y++)
      edge.push(grid.cell(left, y).pinned, grid.cell(right, y).pinned);
    let arrow = 0;
    for (let y = top + 1; y < bottom; y++)
      for (let x = left + 1; x < right; x++) if (grid.cell(x, y).pinned) arrow++;
    return { border: edge.every(Boolean), anyBorder: edge.some(Boolean), arrow };
  });

/** The arrow icon is 25 Cells. */
const ARROW_CELLS = 25;

async function openDeepDive(page: Page, { path, heading } = BAJA): Promise<void> {
  await page.goto(path);
  await expectSection(page, path, heading);
}

test.describe("the arrow back to Projects in the Grid", () => {
  for (const deepDive of DEEP_DIVES) {
    test(`${deepDive.path} has it at the top left, above the title, its border lined up with its link`, async ({
      page,
    }) => {
      await openDeepDive(page, deepDive);
      const button = back(page);
      await expect(button).toHaveCount(1);
      await expect(button).toHaveAttribute("href", "/projects/");
      await expect
        .poll(() => cells(button))
        .toEqual({ border: true, anyBorder: true, arrow: ARROW_CELLS });
      const box = (await button.boundingBox())!;
      const title = (await main(page).locator("h1").boundingBox())!;
      expect(box.y + box.height).toBeLessThan(title.y);
      expect(Math.abs(box.x - title.x)).toBeLessThan(4);
      // Leaving never needs a scroll: it's in sight as the Section opens.
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThan(page.viewportSize()!.height);
    });
  }

  test("hovering it decays its border, leaving the arrow, then it pins again", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "no hover on a touch screen");
    await openDeepDive(page);
    const button = back(page);
    await expect.poll(async () => (await cells(button)).border).toBe(true);
    await button.hover();
    await expect.poll(() => cells(button)).toMatchObject({ border: false, arrow: ARROW_CELLS });
    await expect.poll(async () => (await cells(button)).border).toBe(true);
  });

  test("focusing it decays its border, with a focus ring round it", async ({ page }) => {
    await openDeepDive(page);
    const button = back(page);
    await expect.poll(async () => (await cells(button)).border).toBe(true);
    await button.focus();
    await expect.poll(() => cells(button)).toMatchObject({ border: false, arrow: ARROW_CELLS });
    await expect.poll(async () => (await cells(button)).border).toBe(true);
    await expect(button).toHaveCSS("outline-style", "solid");
  });

  test("a click goes back to Projects through a Transition", async ({ page }) => {
    await openDeepDive(page);
    await expectTransition(page, async () => {
      await back(page).click();
      await expectSection(page, "/projects/", "Projects");
    });
  });

  for (const key of ["Enter", "Space"]) {
    test(`${key} goes back to Projects through a Transition`, async ({ page }) => {
      await openDeepDive(page);
      await expectTransition(page, async () => {
        await back(page).focus();
        await page.keyboard.press(key);
        await expectSection(page, "/projects/", "Projects");
      });
    });
  }
});

const PLAIN_VIEWS = [
  { why: "reduced motion", use: { reducedMotion: "reduce" as const } },
  { why: "JS off", use: { javaScriptEnabled: false } },
];

for (const { why, use } of PLAIN_VIEWS) {
  test.describe(`the link back to Projects in the Plain View (${why})`, () => {
    test.use(use);

    test("is an ordinary ← All projects link above the title, and works", async ({ page }) => {
      await openDeepDive(page);
      const link = back(page);
      await expect(link).toHaveCount(1);
      await expect(link).toBeVisible();
      await expect(link).toHaveText("← All projects");
      const style = await link.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          border: s.borderTopStyle,
          padding: s.paddingLeft,
          decoration: s.textDecorationLine,
        };
      });
      expect(style).toEqual({ border: "none", padding: "0px", decoration: "underline" });
      const box = (await link.boundingBox())!;
      const title = (await main(page).locator("h1").boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(title.y);
      expect(Math.abs(box.x - title.x)).toBeLessThan(4);
      await link.click();
      await expectSection(page, "/projects/", "Projects");
    });
  });
}
