/**
 * Shared setup for the browser tests: import `test` and `expect` from here, not from
 * `@playwright/test`.
 *
 * Every test fails if the page throws or logs a console error. GoatCounter is blocked
 * (no page views counted from tests, no network flakiness), and its failed requests and
 * a missing favicon are the only errors ignored.
 */
import { test as base, expect, type Page } from "@playwright/test";

export { expect };

/** Requests the tests block: GoatCounter's script and its counting endpoint. */
const BLOCKED = /goatcounter\.com|gc\.zgo\.at/;
/** Console errors about these URLs aren't the site's fault. */
const IGNORED = /goatcounter\.com|gc\.zgo\.at|favicon/;

/** Every Section's URL path. */
export const SECTIONS = [
  "/",
  "/about/",
  "/experience/",
  "/projects/",
  "/projects/roborebels/",
  "/projects/baja/",
  "/projects/ftc-event-viewer/",
  "/contact/",
];

export const test = base.extend<{ errors: string[] }>({
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
