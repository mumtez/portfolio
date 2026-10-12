import { expect, expectSection, expectTransition, main, navLink, test } from "./fixtures";

test("Home to Projects to a Deep Dive and back runs Transitions", async ({ page }) => {
  await page.goto("/");
  await expectSection(page, "/", "Andrew Aburustum");

  await expectTransition(page, async () => {
    await navLink(page, "Projects").click();
    await expectSection(page, "/projects/", "Projects");
  });
  await expect(navLink(page, "Projects")).toHaveAttribute("aria-current", "page");
  await expect(navLink(page, "Home")).not.toHaveAttribute("aria-current");

  await expectTransition(page, async () => {
    await main(page)
      .getByRole("link", { name: "Baja fuel-level estimator Read the story" })
      .click();
    await expectSection(page, "/projects/baja/", "Baja fuel-level estimator");
  });
  await expect(navLink(page, "Projects")).toHaveAttribute("aria-current", "true");

  await expectTransition(page, async () => {
    await page.goBack();
    await expectSection(page, "/projects/", "Projects");
  });
  await expect(navLink(page, "Projects")).toHaveAttribute("aria-current", "page");
});
