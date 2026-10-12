import {
  expect,
  expectGrid,
  expectSection,
  expectTransition,
  navLink,
  test,
  toggle,
} from "./fixtures";

test.describe("the theme toggle", () => {
  test.use({ colorScheme: "dark" });

  test("switches the theme, and the choice holds across a reload", async ({ page }) => {
    await page.goto("/about/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(toggle(page, "theme")).toHaveAttribute("aria-pressed", "true");

    await toggle(page, "theme").click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(toggle(page, "theme")).toHaveAttribute("aria-pressed", "false");

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(toggle(page, "theme")).toHaveAttribute("aria-pressed", "false");
  });
});

test("the simulation toggle switches to the Plain View and back", async ({ page }) => {
  await page.goto("/about/");
  await expectGrid(page, true);
  await expect(page.locator("canvas#grid")).toBeVisible();

  await toggle(page, "simulation").click();
  await expectGrid(page, false);
  await expect(toggle(page, "simulation")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("canvas#grid")).toBeHidden();
  // The nav links are ordinary links again, no longer laid transparently over cells.
  for (const label of ["Home", "About", "Experience", "Projects", "Contact"]) {
    const link = navLink(page, label);
    await expect(link).toBeVisible();
    await expect(link).not.toHaveClass(/\bon-grid\b/);
    await expect(link).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
  }

  await toggle(page, "simulation").click();
  await expectGrid(page, true);
  await expect(page.locator("canvas#grid")).toBeVisible();

  await expectTransition(page, async () => {
    await navLink(page, "Experience").click();
    await expectSection(page, "/experience/", "Experience");
  });
});
