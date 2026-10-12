import { expect, expectGrid, main, test, toggle } from "./fixtures";

// In the Grid the toggles are two small icon Buttons in a corner, with their real buttons
// laid over the cells.

test("sits the toggles small, side by side, in a corner", async ({ page }) => {
  await page.goto("/about/");
  await expectGrid(page, true);
  const viewport = page.viewportSize()!;
  const theme = (await toggle(page, "theme").boundingBox())!;
  const life = (await toggle(page, "simulation").boundingBox())!;
  // On a phone, top-right beside the nav column; on a desktop, whose nav fills the top
  // row, bottom-right, beside the Body Text's column.
  const top = viewport.width < 600;
  for (const box of [theme, life]) {
    // Small: no bigger than a fingertip's comfortable target, 80px at most.
    expect(box.width).toBeLessThanOrEqual(80);
    expect(box.height).toBeLessThanOrEqual(90);
    expect(box.x).toBeGreaterThan(viewport.width / 2);
    if (top) expect(box.y).toBeLessThan(40);
    else expect(box.y + box.height).toBeGreaterThan(viewport.height - 40);
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

test("leaves the Body Text the whole screen", async ({ page }) => {
  await page.goto("/experience/");
  await expectGrid(page, true);
  await expect(main(page)).toHaveCSS("opacity", "1");
  const viewport = page.viewportSize()!;

  // No strip kept for the toggles: the Body Text's box runs to the bottom of the screen.
  const box = (await main(page).boundingBox())!;
  expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
});

for (const path of ["/experience/", "/projects/", "/projects/roborebels/"]) {
  test(`never covers the Body Text or its Panels with the toggles, scrolling ${path}`, async ({
    page,
  }) => {
    await page.goto(path);
    await expectGrid(page, true);
    await expect(main(page)).toHaveCSS("opacity", "1");
    const toggles = await Promise.all(
      (["theme", "simulation"] as const).map(async (id) => (await toggle(page, id).boundingBox())!),
    );
    const scrollable = await main(page).evaluate((el) => el.scrollHeight - el.clientHeight);
    // On a phone every one of these is long, so there's a middle to scroll through.
    if (page.viewportSize()!.width < 600) expect(scrollable).toBeGreaterThan(200);

    for (const share of [0, 0.25, 0.5, 0.75, 1]) {
      await main(page).evaluate((el, share) => (el.scrollTop = share * el.scrollHeight), share);
      // What shows of the Body Text: every line of text and every Panel, clipped to `main`.
      const shown = await main(page).evaluate((el) => {
        const view = el.getBoundingClientRect();
        const clip = (r: DOMRect, what: string) => ({
          x: Math.max(r.left, view.left),
          y: Math.max(r.top, view.top),
          right: Math.min(r.right, view.right),
          bottom: Math.min(r.bottom, view.bottom),
          what,
        });
        const out: ReturnType<typeof clip>[] = [];
        const range = document.createRange();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent?.trim();
          if (!text) continue;
          range.selectNodeContents(node);
          for (const r of range.getClientRects())
            if (r.width > 1 && r.height > 1) out.push(clip(r, `text "${text.slice(0, 30)}"`));
        }
        for (const panel of el.querySelectorAll("[data-panel]"))
          out.push(clip(panel.getBoundingClientRect(), `Panel ${panel.tagName.toLowerCase()}`));
        return out.filter((r) => r.right > r.x && r.bottom > r.y);
      });
      expect(shown.length, "some Body Text in sight").toBeGreaterThan(0);
      const covered = shown.filter((r) =>
        toggles.some(
          (t) => r.x < t.x + t.width && t.x < r.right && r.y < t.y + t.height && t.y < r.bottom,
        ),
      );
      expect(
        covered.map((r) => r.what),
        `scrolled ${share * 100}%`,
      ).toEqual([]);
    }
  });
}
