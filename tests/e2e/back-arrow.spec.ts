import type { Locator, Page } from "@playwright/test";
import {
  expect,
  expectNoSidewaysScroll,
  expectSection,
  expectTransition,
  main,
  test,
} from "./fixtures";

// Every Deep Dive opens with a way back to Projects. On a wide screen it's fixed in the
// margin left of the text column, its top level with the title's, and stays put while the
// Body Text scrolls; narrower, it's at the top left, above the title, and scrolls. In
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

/** From this viewport width up, the margin left of the column holds the arrow, fixed. */
const WIDE_PX = 1024;
const isWide = (page: Page) => page.viewportSize()!.width >= WIDE_PX;

/** Scroll the Body Text by `px` (its own scroll box in the Grid, else the page), and say how far it went. */
const scrollBodyText = (page: Page, px: number) =>
  page.evaluate((px) => {
    const scroller = document.documentElement.classList.contains("grid-on")
      ? document.querySelector("main")!
      : document.scrollingElement!;
    scroller.scrollTop += px;
    return scroller.scrollTop;
  }, px);

/**
 * Where the link back is against the title: on a wide screen left of the text column
 * with a clear gap, its top level with the title's; narrower, above the title, at the
 * column's left edge.
 */
async function expectPlaced(page: Page, link: Locator): Promise<void> {
  const box = (await link.boundingBox())!;
  const title = (await main(page).locator("h1").boundingBox())!;
  if (isWide(page)) {
    expect(box.x + box.width).toBeLessThanOrEqual(title.x - 16);
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(Math.abs(box.y - title.y)).toBeLessThan(2);
  } else {
    expect(box.y + box.height).toBeLessThanOrEqual(title.y);
    expect(Math.abs(box.x - title.x)).toBeLessThan(4);
  }
}

async function openDeepDive(page: Page, { path, heading } = BAJA): Promise<void> {
  await page.goto(path);
  await expectSection(page, path, heading);
}

test.describe("the arrow back to Projects in the Grid", () => {
  for (const deepDive of DEEP_DIVES) {
    test(`${deepDive.path} has it beside or above the title, its border lined up with its link`, async ({
      page,
    }) => {
      await openDeepDive(page, deepDive);
      const button = back(page);
      await expect(button).toHaveCount(1);
      await expect(button).toHaveAttribute("href", "/projects/");
      await expect
        .poll(() => cells(button))
        .toEqual({ border: true, anyBorder: true, arrow: ARROW_CELLS });
      await expectPlaced(page, button);
      const box = (await button.boundingBox())!;
      // Leaving never needs a scroll: it's in sight as the Section opens.
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThan(page.viewportSize()!.height);
    });
  }

  test("scrolling the Body Text leaves it fixed on a wide screen, its Cells lined up; narrower, it scrolls away", async ({
    page,
  }) => {
    await openDeepDive(page);
    const button = back(page);
    await expect.poll(async () => (await cells(button)).border).toBe(true);
    const before = (await button.boundingBox())!;
    expect(await scrollBodyText(page, 120)).toBeGreaterThan(100);
    if (isWide(page)) {
      // The Grid redraws on the scroll's next frame: give it time to have moved anything.
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 100))),
      );
      expect(await button.boundingBox()).toEqual(before);
      expect(await cells(button)).toEqual({ border: true, anyBorder: true, arrow: ARROW_CELLS });
    } else {
      // Scrolled up with the story, out of the scroll box: its Cells go with it.
      expect((await button.boundingBox())!.y).toBeLessThan(before.y - 100);
      await expect.poll(async () => (await cells(button)).anyBorder).toBe(false);
    }
  });

  test("just below the wide breakpoint it falls back above the title, with no overlap or sideways scroll", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "a desktop window, resized");
    for (const width of [WIDE_PX - 1, WIDE_PX]) {
      await page.setViewportSize({ width, height: 900 });
      await openDeepDive(page);
      const button = back(page);
      await expect
        .poll(() => cells(button))
        .toEqual({ border: true, anyBorder: true, arrow: ARROW_CELLS });
      await expectPlaced(page, button);
      await expectNoSidewaysScroll(page);
    }
  });

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

    test("is an ordinary ← All projects link beside or above the title, and works", async ({
      page,
    }) => {
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
      await expectPlaced(page, link);
      await expectNoSidewaysScroll(page);
      // On a wide screen it stays in sight as the story scrolls; narrower, it scrolls away.
      const before = (await link.boundingBox())!;
      const scrolled = await scrollBodyText(page, 400);
      expect(scrolled).toBeGreaterThan(100);
      const after = (await link.boundingBox())!;
      if (isWide(page)) {
        expect(after.y).toBeGreaterThanOrEqual(0);
        expect(after.x).toBe(before.x);
      } else expect(after.y).toBeCloseTo(before.y - scrolled, 0);
      await scrollBodyText(page, -400);
      await link.click();
      await expectSection(page, "/projects/", "Projects");
    });
  });
}
