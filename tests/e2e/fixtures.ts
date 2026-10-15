/**
 * Shared setup for the browser tests: import `test` and `expect` from here, not from
 * `@playwright/test`.
 *
 * Every test fails if the page throws or logs a console error. GoatCounter is blocked
 * (no page views counted from tests, no network flakiness), and its failed requests, a
 * missing favicon and WebKit's own native video-control icons failing to load (a quirk of
 * Playwright's WebKit build, not the site) are the only errors ignored.
 */
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type {} from "../../src/grid/test-hooks";

export { TEST_SECTION } from "../../src/lib/test-section";

export { expect };

/** Requests the tests block: GoatCounter's script and its counting endpoint. */
const BLOCKED = /goatcounter\.com|gc\.zgo\.at/;
/** Console errors about these URLs, or WebKit's native video-control icons, aren't the site's fault. */
const IGNORED =
  /goatcounter\.com|gc\.zgo\.at|favicon|^Button failed to load, iconName = [\w-]+-placard\b/;

/** Every Section's URL path. */
export const SECTIONS = [
  "/",
  "/about/",
  "/experience/",
  "/projects/",
  "/projects/roborebels/",
  "/projects/baja/",
  "/projects/ftc-event-viewer/",
  "/projects/climbing-wall/",
  "/contact/",
];

export const test = base.extend<{ errors: string[]; gridTest: void }>({
  // Every page asks the Grid for its test hooks (`window.gridTest`, see `src/grid/test-hooks.ts`).
  gridTest: [
    async ({ page }, use) => {
      await page.addInitScript(() => (window.wantsGridTest = true));
      await use();
    },
    { auto: true },
  ],
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      await page.route(BLOCKED, (route) => route.abort());
      page.on("pageerror", (error) => errors.push(`uncaught: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const where = message.location().url;
        if (IGNORED.test(where) || IGNORED.test(message.text())) return;
        errors.push(`console: ${message.text()} (${where})`);
      });
      await use(errors);
      expect(errors, "page errors and console errors").toEqual([]);
    },
    { auto: true },
  ],
});

/** The Section's main content. */
export const main = (page: Page) => page.locator("main");

/** The top-level nav link with this label. */
export const navLink = (page: Page, label: string) =>
  page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: label, exact: true });

/** A theme or simulation toggle, by its `data-toggle` id. */
export const toggle = (page: Page, id: "theme" | "simulation") =>
  page.locator(`button[data-toggle="${id}"]`);

/**
 * The Section at `path` is showing and done arriving: the URL, its h1, and its Body
 * Text fully visible (a Transition fades it in once it settles).
 */
export async function expectSection(page: Page, path: string, heading: string): Promise<void> {
  await expect(page).toHaveURL(path);
  await expect(main(page).locator("h1")).toHaveText(heading);
  await expect(main(page)).toHaveCSS("opacity", "1");
}

/**
 * Run `navigate` and check it was a Transition: the URL changed without loading a new
 * page (a page load is the Plain View's ordinary navigation).
 */
export async function expectTransition(
  page: Page,
  navigate: () => Promise<unknown>,
): Promise<void> {
  const marked = () => (window as { e2eSamePage?: boolean }).e2eSamePage;
  await page.evaluate(() => ((window as { e2eSamePage?: boolean }).e2eSamePage = true));
  await navigate();
  expect(await page.evaluate(marked), "the same page, not a new page load").toBe(true);
}

/** Whether the Grid is running over the page (off is the Plain View). */
export async function expectGrid(page: Page, on: boolean): Promise<void> {
  const html = page.locator("html");
  if (on) await expect(html).toHaveClass(/\bgrid-on\b/);
  else await expect(html).not.toHaveClass(/\bgrid-on\b/);
}

/** Neither the page nor its Section's own scroll box scrolls sideways. */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflowing = await page.evaluate(() =>
    [document.documentElement, document.querySelector("main")].flatMap((el) =>
      el && el.scrollWidth > el.clientWidth
        ? [`${el.tagName.toLowerCase()}: ${el.scrollWidth}px wide in ${el.clientWidth}px`]
        : [],
    ),
  );
  expect(overflowing).toEqual([]);
}

/**
 * The Cells in a box on screen (rounded to Cells): whether every Cell on its edge is
 * pinned, whether any is, and how many Pinned Cells lie inside it (a label or icon).
 */
export const cellsAt = (page: Page, box: { x: number; y: number; width: number; height: number }) =>
  page.evaluate((r) => {
    const grid = window.gridTest!;
    const { cellPx } = grid.shapes();
    const left = Math.round(r.x / cellPx);
    const top = Math.round(r.y / cellPx);
    const right = Math.round((r.x + r.width) / cellPx) - 1;
    const bottom = Math.round((r.y + r.height) / cellPx) - 1;
    const edge: boolean[] = [];
    for (let x = left; x <= right; x++)
      edge.push(grid.cell(x, top).pinned, grid.cell(x, bottom).pinned);
    for (let y = top + 1; y < bottom; y++)
      edge.push(grid.cell(left, y).pinned, grid.cell(right, y).pinned);
    let inside = 0;
    for (let y = top + 1; y < bottom; y++)
      for (let x = left + 1; x < right; x++) if (grid.cell(x, y).pinned) inside++;
    return { border: edge.every(Boolean), anyBorder: edge.some(Boolean), inside };
  }, box);

/** The Cells round a Button's real link or button, as `cellsAt` its box. */
export const cellsRound = async (button: Locator) =>
  cellsAt(button.page(), (await button.boundingBox())!);
