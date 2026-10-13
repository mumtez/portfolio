import type { Page } from "@playwright/test";
import {
  expect,
  expectNoSidewaysScroll,
  expectSection,
  expectTransition,
  main,
  navLink,
  TEST_SECTION,
  test,
} from "./fixtures";

// A Transition follows the real Body Text: the page measures the Section's text into
// line shapes in cells, the old Section's lines dissolve into Life as its HTML fades
// out, and the next Section's condense out of Cells before its HTML fades in, in about
// 800ms.

/** The shapes the Grid last measured from the page, and its cell size. */
const measured = (page: Page) => page.evaluate(() => window.gridTest!.shapes());

/**
 * Click `label` in the nav and time it in the page: how long the old `<main>` stays
 * on screen (fading out), and how long until the next one is released to fade in.
 */
async function timedNavClick(page: Page, label: string) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, number>;
    const old = document.querySelector("main")!;
    document.addEventListener(
      "click",
      () => {
        const t0 = performance.now();
        const poll = () => {
          const now = performance.now() - t0;
          if (old.isConnected) w.oldGone = now;
          if (!document.querySelector("main.released")) w.released = now;
          if (old.isConnected || !document.querySelector("main.released"))
            requestAnimationFrame(poll);
        };
        poll();
      },
      { capture: true, once: true },
    );
  });
  // Fetch the page first, so the time is the Transition's, not the network's.
  await page.evaluate((path) => fetch(path), `/${label.toLowerCase()}/`);
  await navLink(page, label).click();
  await expect(main(page)).toHaveClass(/released/);
  return page.evaluate(() => {
    const { oldGone, released } = window as unknown as Record<string, number>;
    return { oldGone, released };
  });
}

test("the old Section's HTML fades out, and the next one is released in about 800ms", async ({
  page,
}) => {
  await page.goto("/about/");
  await expect(main(page)).toHaveCSS("opacity", "1");
  const { oldGone, released } = await timedNavClick(page, "Experience");
  // Fading out, not vanishing at once.
  expect(oldGone).toBeGreaterThan(150);
  // Seven 120ms ticks, give or take a frame and a tick's phase.
  expect(released).toBeGreaterThan(700);
  expect(released).toBeLessThan(1300);
  await expectSection(page, "/experience/", "Experience");
  await expectNoSidewaysScroll(page);
});

test("the faint region behind the text takes the next Section's size as soon as its HTML lands", async ({
  page,
}) => {
  await page.goto("/about/");
  await expect(main(page)).toHaveCSS("opacity", "1");
  await page.evaluate(() => fetch("/contact/"));
  // Sample the faint region on every frame while the next Section's HTML is in the page
  // but not yet released: it should already end where that Section's text ends.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.faintSamples = [];
    const poll = () => {
      const arriving = document.querySelector("main.arriving:not(.released)");
      if (arriving) {
        const { cellPx } = window.gridTest!.shapes();
        const textBottom = arriving.lastElementChild!.getBoundingClientRect().bottom;
        const faint = window.gridTest!.bodyText();
        (w.faintSamples as number[][]).push([
          faint.y + faint.height,
          Math.ceil(textBottom / cellPx),
        ]);
      }
      if (!document.querySelector("main.released.arriving")) requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
  await navLink(page, "Contact").click();
  await expectSection(page, "/contact/", "Contact");
  const samples = await page.evaluate(
    () => (window as unknown as Record<string, number[][]>).faintSamples,
  );
  expect(samples.length).toBeGreaterThan(0);
  // A frame's grace for the draw that follows the swap.
  for (const [faintBottom, textBottom] of samples.slice(2)) expect(faintBottom).toBe(textBottom);
});

/**
 * The Grid's latest line shapes lie over the Section's text: each line's middle is over
 * the Section, and the first line on screen of every paragraph is one of them.
 */
async function expectLinesOverText(page: Page): Promise<void> {
  const { cellPx, shapes: all } = await measured(page);
  const shapes = all.filter((s) => s.kind === "line");
  expect(shapes.length).toBeGreaterThan(0);
  for (const { box } of shapes) {
    const inMain = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest("main"),
      [(box.x + box.width / 2) * cellPx, (box.y + box.height / 2) * cellPx],
    );
    expect(inMain, `the middle of ${JSON.stringify(box)} is over the Section`).toBe(true);
  }
  const firstLines = await main(page)
    .locator("p")
    .evaluateAll((ps) => {
      const shown = document.querySelector("main")!.getBoundingClientRect();
      return ps.flatMap((p) => {
        // A Range's client rects are the paragraph's line fragments, not its block box.
        const range = document.createRange();
        range.selectNodeContents(p);
        const r = [...range.getClientRects()].find((r) => r.width > 4 && r.top >= shown.top);
        return r && r.bottom <= shown.bottom ? [{ x: r.left + 2, y: r.top + r.height / 2 }] : [];
      });
    });
  expect(firstLines.length).toBeGreaterThan(0);
  for (const at of firstLines) {
    const cell = { x: Math.floor(at.x / cellPx), y: Math.floor(at.y / cellPx) };
    expect(
      shapes.some(
        ({ box }) =>
          cell.x >= box.x &&
          cell.x < box.x + box.width &&
          cell.y >= box.y &&
          cell.y < box.y + box.height,
      ),
      `a line at cell ${JSON.stringify(cell)}`,
    ).toBe(true);
  }
}

test("the Body Text is measured into line shapes that lie over its text", async ({ page }) => {
  await page.goto("/about/");
  await expect(main(page)).toHaveCSS("opacity", "1");
  await expect.poll(async () => (await measured(page)).shapes.length).toBeGreaterThan(0);
  await expectLinesOverText(page);
});

test("the line shapes follow the text as it scrolls", async ({ page }) => {
  await page.goto(TEST_SECTION);
  await expect(main(page)).toHaveCSS("opacity", "1");
  await expect.poll(async () => (await measured(page)).shapes.length).toBeGreaterThan(0);
  const before = JSON.stringify((await measured(page)).shapes);
  const scrolled = await main(page).evaluate((el) => {
    el.scrollTop = 150;
    return el.scrollTop;
  });
  test.skip(scrolled < 60, "the Section doesn't scroll at this size");
  await expect.poll(async () => JSON.stringify((await measured(page)).shapes)).not.toBe(before);
  await expectLinesOverText(page);
});

test("back and forward, and a redirect mid-Transition, land on the right Section", async ({
  page,
}) => {
  await page.goto("/about/");
  await expectSection(page, "/about/", "About");
  await expectTransition(page, async () => {
    await navLink(page, "Experience").click();
    await navLink(page, "Contact").click();
    await expectSection(page, "/contact/", "Contact");
  });
  await expectTransition(page, async () => {
    await page.goBack();
    await expectSection(page, "/experience/", "Experience");
    await page.goBack();
    await expectSection(page, "/about/", "About");
    await page.goForward();
    await expectSection(page, "/experience/", "Experience");
  });
  await expectNoSidewaysScroll(page);
});
