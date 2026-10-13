import type { Locator, Page } from "@playwright/test";
import {
  cellsRound,
  expect,
  expectGrid,
  expectNoSidewaysScroll,
  main,
  navLink,
  SECTIONS,
  test,
  toggle,
} from "./fixtures";

// With the Grid on, a phone held upright gets a four-row nav (#38):
//   [HOME] [ABOUT]
//   [EXPERIENCE]
//   [PROJECTS]
//   [CONTACT] [theme] [life]
// A desktop keeps its single row, and a phone on its side its wrapped rows with the
// toggles in the bottom-right corner.

const NAV = ["Home", "About", "Experience", "Projects", "Contact"];
const TOGGLES = ["theme", "simulation"] as const;

/** The nav links and toggles grouped into rows by where they sit, top to bottom, left to right. */
async function rows(page: Page): Promise<string[][]> {
  const placed = [
    ...(await Promise.all(
      NAV.map(async (name) => ({ name, box: (await navLink(page, name).boundingBox())! })),
    )),
    ...(await Promise.all(
      TOGGLES.map(async (name) => ({ name, box: (await toggle(page, name).boundingBox())! })),
    )),
  ].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const out: { y: number; names: string[] }[] = [];
  for (const { name, box } of placed) {
    const row = out.find((r) => Math.abs(r.y - box.y) < 2);
    if (row) row.names.push(name);
    else out.push({ y: box.y, names: [name] });
  }
  return out.map((r) => r.names);
}

/** Every nav link and toggle lies inside the viewport, with no two overlapping. */
async function expectAllInside(page: Page): Promise<void> {
  const viewport = page.viewportSize()!;
  const boxes = await Promise.all(
    [...NAV.map((n) => navLink(page, n)), ...TOGGLES.map((t) => toggle(page, t))].map(
      async (l) => (await l.boundingBox())!,
    ),
  );
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 0.5);
  }
  boxes.forEach((a, i) =>
    boxes.slice(i + 1).forEach((b) => {
      const apart =
        a.x + a.width <= b.x + 0.5 ||
        b.x + b.width <= a.x + 0.5 ||
        a.y + a.height <= b.y + 0.5 ||
        b.y + b.height <= a.y + 0.5;
      expect(apart, `${JSON.stringify(a)} and ${JSON.stringify(b)}`).toBe(true);
    }),
  );
}

/** Whether every Cell of the border round `button` is pinned now. */
const borderPinned = async (button: Locator) => (await cellsRound(button)).border;

const FOUR_ROWS = [["Home", "About"], ["Experience"], ["Projects"], ["Contact", ...TOGGLES]];

test.describe("on a phone held upright", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, "an iPhone");
  });

  test("the nav is four rows, toggles beside CONTACT, on every Section", async ({ page }) => {
    for (const path of SECTIONS) {
      await page.goto(path);
      await expectGrid(page, true);
      await expect(main(page)).toHaveCSS("opacity", "1");
      expect(await rows(page), path).toEqual(FOUR_ROWS);
      await expectAllInside(page);
      await expectNoSidewaysScroll(page);
    }
  });

  test("the Body Text starts just below the nav's last row", async ({ page }) => {
    await page.goto("/about/");
    await expectGrid(page, true);
    await expect(main(page)).toHaveCSS("opacity", "1");
    const contact = (await navLink(page, "Contact").boundingBox())!;
    const text = (await main(page).boundingBox())!;
    // 1.25rem below the nav's last row: well short of another nav row (about 70px).
    expect(text.y - (contact.y + contact.height)).toBeCloseTo(20, 0);
  });

  test("a tap on each toggle in its new spot presses it", async ({ page }) => {
    await page.goto("/about/");
    await expectGrid(page, true);
    const html = page.locator("html");
    const before = await html.getAttribute("data-theme");
    const theme = (await toggle(page, "theme").boundingBox())!;
    await page.touchscreen.tap(theme.x + theme.width / 2, theme.y + theme.height / 2);
    await expect(html).not.toHaveAttribute("data-theme", before!);

    const life = (await toggle(page, "simulation").boundingBox())!;
    await page.touchscreen.tap(life.x + life.width / 2, life.y + life.height / 2);
    await expectGrid(page, false);
    await expect(toggle(page, "simulation")).toHaveAttribute("aria-pressed", "false");
  });

  test("focusing a toggle decays its border, not CONTACT's, then it pins again", async ({
    page,
  }) => {
    await page.goto("/about/");
    await expectGrid(page, true);
    const theme = toggle(page, "theme");
    await expect.poll(() => borderPinned(theme)).toBe(true);
    await theme.focus();
    await expect.poll(() => borderPinned(theme)).toBe(false);
    expect(await borderPinned(navLink(page, "Contact"))).toBe(true);
    await expect.poll(() => borderPinned(theme)).toBe(true);
  });

  test("at the narrowest phone, 320px wide, nothing overflows", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    for (const path of ["/", "/about/", "/projects/baja/"]) {
      await page.goto(path);
      await expectGrid(page, true);
      await expect(main(page)).toHaveCSS("opacity", "1");
      // Every row still fits at 320px, so none has to wrap.
      expect(await rows(page), path).toEqual(FOUR_ROWS);
      await expectAllInside(page);
      await expectNoSidewaysScroll(page);
    }
  });

  test("on its side the nav keeps its wrapped rows, toggles in the bottom corner", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/about/");
    await expectGrid(page, true);
    expect(await rows(page)).toEqual([
      ["Home", "About", "Experience"],
      ["Projects", "Contact"],
      [...TOGGLES],
    ]);
    const life = (await toggle(page, "simulation").boundingBox())!;
    expect(life.y + life.height).toBeGreaterThan(390 - 40);
    await expectNoSidewaysScroll(page);
  });
});

test("on a desktop the nav stays one row, toggles in the bottom corner", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "a desktop window");
  for (const path of ["/", "/about/"]) {
    await page.goto(path);
    await expectGrid(page, true);
    expect(await rows(page), path).toEqual([NAV, [...TOGGLES]]);
  }
});
