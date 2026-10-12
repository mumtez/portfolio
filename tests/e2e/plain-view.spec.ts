import type { Page } from "@playwright/test";
import { expect, expectGrid, main, navLink, test, toggle } from "./fixtures";

// The Plain View (simulation off, reduced motion, or JS off) has its own reading layout:
// top-aligned, the five-link nav as a tidy row with the current Section marked, Home's
// name and tagline straight under the nav, and the toggles as a quiet text switch.

const NAV = ["Home", "About", "Experience", "Projects", "Contact"];

/** The nav links' boxes, in nav order. */
const navBoxes = (page: Page) =>
  Promise.all(NAV.map(async (label) => (await navLink(page, label).boundingBox())!));

/**
 * The words the text switch shows for a toggle, without the separator between the two
 * (drawn by CSS, so not part of the button's name).
 */
const switchText = (page: Page, id: "theme" | "simulation") =>
  toggle(page, id).evaluate((button) => {
    const shown = (pseudo: string) =>
      /^"([^"]*)"/.exec(getComputedStyle(button, pseudo).content)?.[1] ?? "";
    return (shown("::before") + shown("::after")).replace(/^[\s·]+/, "");
  });

const PLAIN_VIEWS = [
  { why: "reduced motion", use: { reducedMotion: "reduce" as const } },
  { why: "JS off", use: { javaScriptEnabled: false } },
];

for (const { why, use } of PLAIN_VIEWS) {
  test.describe(`the Plain View (${why})`, () => {
    test.use(use);

    test("Home shows the nav, then the name and tagline at the top, no gap", async ({ page }) => {
      await page.goto("/");
      const navBottom = Math.max(...(await navBoxes(page)).map((b) => b.y + b.height));
      const name = (await main(page).locator("h1").boundingBox())!;
      const tagline = (await main(page).locator("h1 + p").boundingBox())!;
      expect(name.y).toBeGreaterThan(navBottom);
      expect(name.y - navBottom).toBeLessThan(80);
      expect(tagline.y).toBeGreaterThan(name.y + name.height - 1);
      expect(tagline.y - (name.y + name.height)).toBeLessThan(40);
      expect(tagline.y + tagline.height).toBeLessThan(page.viewportSize()!.height / 2);
      // Large type for the name.
      const fontSize = (selector: string) =>
        main(page)
          .locator(selector)
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(await fontSize("h1")).toBeGreaterThanOrEqual(1.75 * (await fontSize("h1 + p")));
    });

    test("the nav is a tidy row of five links, at most two rows on a phone", async ({ page }) => {
      await page.goto("/experience/");
      const boxes = await navBoxes(page);
      const rows = new Set(boxes.map((b) => Math.round(b.y)));
      expect(rows.size).toBeLessThanOrEqual(2);
      // Left to right in reading order within each row.
      for (let i = 1; i < boxes.length; i++) {
        if (Math.round(boxes[i].y) === Math.round(boxes[i - 1].y)) {
          expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x + boxes[i - 1].width);
        }
      }
      // The Section's content starts right under the header, top-aligned.
      const top = await main(page).evaluate((el) => {
        const shown = [...el.children].find((child) => child.getBoundingClientRect().height > 1);
        return shown!.getBoundingClientRect().top;
      });
      expect(top - Math.max(...boxes.map((b) => b.y + b.height))).toBeLessThan(80);
    });
  });
}

for (const colorScheme of ["dark", "light"] as const) {
  test.describe(`the Plain View in the ${colorScheme} theme`, () => {
    test.use({ reducedMotion: "reduce", colorScheme });

    test("marks the current nav link apart from the others", async ({ page }) => {
      await page.goto("/about/");
      await expectGrid(page, false);
      await expect(navLink(page, "About")).toHaveAttribute("aria-current", "page");
      const look = (label: string) =>
        navLink(page, label).evaluate((a) => {
          const s = getComputedStyle(a);
          return [s.color, s.fontWeight, s.textDecorationLine, s.borderBottomStyle].join();
        });
      const current = await look("About");
      for (const label of ["Home", "Experience", "Projects", "Contact"]) {
        expect(await look(label)).not.toBe(current);
      }
    });

    test("the toggles are a compact text switch that works and keeps names and state", async ({
      page,
    }) => {
      await page.goto("/about/");
      await expectGrid(page, false);
      const theme = page.getByRole("button", { name: "Dark theme", exact: true });
      const life = page.getByRole("button", { name: "Life simulation", exact: true });
      await expect(theme).toHaveAttribute("aria-pressed", String(colorScheme === "dark"));
      await expect(life).toHaveAttribute("aria-pressed", "false");
      expect(await switchText(page, "theme")).toBe(`Theme: ${colorScheme}`);
      expect(await switchText(page, "simulation")).toBe("Life: off");

      // Quiet: text-sized, no button chrome.
      for (const button of [theme, life]) {
        const box = (await button.boundingBox())!;
        expect(box.height).toBeLessThanOrEqual(32);
        await expect(button).toHaveCSS("border-top-style", "none");
        await expect(button).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      }

      await theme.click();
      const other = colorScheme === "dark" ? "light" : "dark";
      await expect(page.locator("html")).toHaveAttribute("data-theme", other);
      await expect(theme).toHaveAttribute("aria-pressed", String(other === "dark"));
      expect(await switchText(page, "theme")).toBe(`Theme: ${other}`);
    });
  });
}

test("turning the simulation off and back on restores the Grid layout exactly", async ({
  page,
}) => {
  await page.goto("/about/");
  await expectGrid(page, true);
  await expect(main(page)).toHaveCSS("opacity", "1");
  const layout = () =>
    Promise.all([
      main(page).boundingBox(),
      main(page).locator("p").first().boundingBox(),
      ...NAV.map((label) => navLink(page, label).boundingBox()),
      toggle(page, "theme").boundingBox(),
      toggle(page, "simulation").boundingBox(),
    ]);
  const before = await layout();

  await toggle(page, "simulation").click();
  await expectGrid(page, false);
  await toggle(page, "simulation").click();
  await expectGrid(page, true);
  await expect.poll(layout).toEqual(before);
});
