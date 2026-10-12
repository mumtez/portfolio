import { expect, expectGrid, main, test, toggle } from "./fixtures";

// In the Grid the toggles are two small icon Buttons in the bottom-right corner, with
// their real buttons laid over the cells.

test("sits the toggles small, side by side, in the bottom-right corner", async ({ page }) => {
  await page.goto("/about/");
  await expectGrid(page, true);
  const viewport = page.viewportSize()!;
  const theme = (await toggle(page, "theme").boundingBox())!;
  const life = (await toggle(page, "simulation").boundingBox())!;
  for (const box of [theme, life]) {
    // Small: no bigger than a fingertip's comfortable target, 80px at most.
    expect(box.width).toBeLessThanOrEqual(80);
    expect(box.height).toBeLessThanOrEqual(90);
    expect(box.x).toBeGreaterThan(viewport.width / 2);
    expect(box.y + box.height).toBeGreaterThan(viewport.height - 40);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
  expect(theme.x + theme.width).toBeLessThanOrEqual(life.x);
});

test("activates a toggle with Enter and with Space", async ({ page }) => {
  await page.goto("/about/");
  await expectGrid(page, true);
  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  const after = before === "dark" ? "light" : "dark";

  await toggle(page, "theme").focus();
  await page.keyboard.press("Enter");
  await expect(html).toHaveAttribute("data-theme", after);
  await expect(toggle(page, "theme")).toHaveAttribute("aria-pressed", String(after === "dark"));

  await page.keyboard.press("Space");
  await expect(html).toHaveAttribute("data-theme", before!);

  await toggle(page, "simulation").focus();
  await page.keyboard.press("Space");
  await expectGrid(page, false);
  await expect(toggle(page, "simulation")).toHaveAttribute("aria-pressed", "false");
  await toggle(page, "simulation").focus();
  await page.keyboard.press("Enter");
  await expectGrid(page, true);
});

test("leaves the Body Text the whole screen, and its end clears the toggles", async ({ page }) => {
  await page.goto("/experience/");
  await expectGrid(page, true);
  await expect(main(page)).toHaveCSS("opacity", "1");
  const viewport = page.viewportSize()!;

  // No strip kept for the toggles: the Body Text's box runs to the bottom of the screen.
  const box = (await main(page).boundingBox())!;
  expect(box.y + box.height).toBeCloseTo(viewport.height, 0);

  // Scrolled to its end, the last of the Body Text sits above the toggles.
  await main(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
  const textBottom = await main(page).evaluate((el) => {
    const last = el.lastElementChild!;
    return last.getBoundingClientRect().bottom;
  });
  const togglesTop = Math.min(
    (await toggle(page, "theme").boundingBox())!.y,
    (await toggle(page, "simulation").boundingBox())!.y,
  );
  expect(textBottom).toBeLessThanOrEqual(togglesTop);
});
