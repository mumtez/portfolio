import { expect, expectSection, expectTransition, main, navLink, test } from "./fixtures";

// After a Transition, focus moves to the new Section's heading so screen readers announce
// it. That focus comes from the script, not the keyboard, so it shows no ring: browsers
// otherwise draw their own (blue on an iPhone) round it.
test("the heading focused after a Transition shows no browser focus ring", async ({ page }) => {
  await page.goto("/about/");
  await expectSection(page, "/about/", "About");
  for (const [label, path, heading] of [
    ["Projects", "/projects/", "Projects"],
    ["Experience", "/experience/", "Experience"],
  ] as const) {
    await expectTransition(page, async () => {
      await navLink(page, label).click();
      await expectSection(page, path, heading);
    });
    const h1 = main(page).locator("h1");
    await expect(h1).toBeFocused();
    await expect(h1).toHaveCSS("outline-style", "none");
  }
});
