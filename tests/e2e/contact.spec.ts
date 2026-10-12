import type { Locator, Page } from "@playwright/test";
import { expect, expectNoSidewaysScroll, expectSection, main, test } from "./fixtures";

// The Contact links are Button Panels labelled in Cells (EMAIL, GITHUB, LINKEDIN,
// RESUME): each a real link, named in full, laid over a pinned border that decays under
// Life on hover and focus, like the nav's Buttons. In Plain View they're ordinary links.

const LINKS = [
  { name: "aaburustum@olin.edu", href: "mailto:aaburustum@olin.edu" },
  { name: "github.com/mumtez", href: "https://github.com/mumtez" },
  {
    name: "linkedin.com/in/andrew-aburustum",
    href: "https://www.linkedin.com/in/andrew-aburustum",
  },
  { name: "Download my resume (PDF)", href: "/andrew-aburustum-resume.pdf" },
];

const link = (page: Page, name: string) => main(page).getByRole("link", { name, exact: true });
const github = (page: Page) => link(page, "github.com/mumtez");

/**
 * The link's Cells: whether its border is pinned (its top-left corner and the middle of
 * its top edge), and how many Pinned Cells lie inside it (its label).
 */
const cells = (button: Locator) =>
  button.evaluate((el) => {
    const grid = window.gridTest!;
    const { cellPx } = grid.shapes();
    const r = el.getBoundingClientRect();
    const left = Math.round(r.left / cellPx);
    const top = Math.round(r.top / cellPx);
    const right = Math.round(r.right / cellPx);
    const bottom = Math.round(r.bottom / cellPx);
    const middle = Math.round((left + right) / 2);
    let label = 0;
    for (let y = top + 1; y < bottom - 1; y++)
      for (let x = left + 1; x < right - 1; x++) if (grid.cell(x, y).pinned) label++;
    return { border: grid.cell(left, top).pinned && grid.cell(middle, top).pinned, label };
  });
const borderPinned = async (button: Locator) => (await cells(button)).border;

async function openContact(page: Page): Promise<void> {
  await page.goto("/contact/");
  await expectSection(page, "/contact/", "Contact");
}

/** Stand in for GitHub, so following the link doesn't leave the test machine. */
async function fakeGitHub(page: Page): Promise<void> {
  await page.route("https://github.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>GitHub</title>" }),
  );
}

test.describe("Contact Buttons in the Grid", () => {
  test("each link is drawn as a Button, its label in Cells inside a pinned border, fitting the column", async ({
    page,
  }) => {
    await openContact(page);
    const viewport = page.viewportSize()!;
    for (const { name, href } of LINKS) {
      const button = link(page, name);
      await expect(button).toHaveAttribute("href", href);
      await expect.poll(() => borderPinned(button)).toBe(true);
      // A label of four to eight capitals: well over a dozen Pinned Cells.
      expect((await cells(button)).label).toBeGreaterThan(20);
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(16);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 16);
    }
    await expect(link(page, "Download my resume (PDF)")).toHaveAttribute("download");
    await expectNoSidewaysScroll(page);
  });

  test("hovering a Button decays its border, leaving its label, then it pins again", async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, "no hover on a touch screen");
    await openContact(page);
    const button = github(page);
    await expect.poll(() => borderPinned(button)).toBe(true);
    const { label } = await cells(button);
    await button.hover();
    await expect.poll(() => cells(button)).toEqual({ border: false, label });
    await expect.poll(() => borderPinned(button)).toBe(true);
    // Only that Button's border.
    expect(await borderPinned(link(page, "aaburustum@olin.edu"))).toBe(true);
  });

  test("focusing a Button decays its border, with a focus ring round it", async ({ page }) => {
    await openContact(page);
    const button = github(page);
    await expect.poll(() => borderPinned(button)).toBe(true);
    await button.focus();
    await expect.poll(() => borderPinned(button)).toBe(false);
    await expect.poll(() => borderPinned(button)).toBe(true);
    await expect(button).toHaveCSS("outline-style", "solid");
  });

  test("a click follows the link", async ({ page }) => {
    await fakeGitHub(page);
    await openContact(page);
    await github(page).click();
    await expect(page).toHaveURL("https://github.com/mumtez");
  });

  for (const key of ["Enter", "Space"]) {
    test(`${key} follows the link`, async ({ page }) => {
      await fakeGitHub(page);
      await openContact(page);
      await github(page).focus();
      await page.keyboard.press(key);
      await expect(page).toHaveURL("https://github.com/mumtez");
    });
  }

  test("the resume Button downloads the PDF", async ({ page }) => {
    await openContact(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      link(page, "Download my resume (PDF)").click(),
    ]);
    expect(download.suggestedFilename()).toBe("andrew-aburustum-resume.pdf");
  });
});

test.describe("Contact links in the Plain View", () => {
  test.use({ reducedMotion: "reduce" });

  test("are ordinary links, each after its label", async ({ page }) => {
    await openContact(page);
    for (const { name } of LINKS) {
      const a = link(page, name);
      await expect(a).toBeVisible();
      const style = await a.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          border: s.borderTopStyle,
          padding: s.paddingLeft,
          decoration: s.textDecorationLine,
        };
      });
      expect(style).toEqual({ border: "none", padding: "0px", decoration: "underline" });
    }
    await expect(main(page).locator("li").first()).toHaveText(/EMAIL\s*aaburustum@olin\.edu/);
    await expectNoSidewaysScroll(page);
  });
});
