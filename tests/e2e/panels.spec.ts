import type { Page } from "@playwright/test";
import { expect, expectNoSidewaysScroll, expectSection, main, navLink, test } from "./fixtures";

// Panels: blocks of Body Text inside a border. With the Grid on, each Panel's border is
// Pinned Cells along its HTML box's edge (every other cell for a dashed Placeholder),
// following the text as it scrolls, with Life carrying on behind its text (only a Frame
// holding media walls off its interior). In Plain View it's a thin line
// in the theme's pinned green, dashed for a Placeholder.

/** How each Panel on screen lies in the Grid, checked in the page against its HTML box. */
interface PanelSeen {
  kind: string;
  /** How far each side of its border Cells is from its HTML box's edge, in cells. */
  offsets: number[];
  /** Whether its top-left corner Cell, and the one beside it, are pinned. */
  corner: boolean;
  besideCorner: boolean;
  /** Whether the Cell in its middle is a wall. */
  middleIsWall: boolean;
  /** Whether it's marked walled (a Frame holding media). */
  walled: boolean;
}

/** Every Panel wholly on screen in the Section's scroll box, as the Grid has it now. */
const panelsSeen = (page: Page): Promise<PanelSeen[]> =>
  page.evaluate(() => {
    const grid = window.gridTest!;
    const { cellPx } = grid.shapes();
    const shown = document.querySelector("main")!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>("main [data-panel]")].flatMap((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < shown.top || r.bottom > shown.bottom) return [];
      const x = Math.round(r.left / cellPx);
      const y = Math.round(r.top / cellPx);
      const right = Math.round(r.right / cellPx);
      const bottom = Math.round(r.bottom / cellPx);
      return [
        {
          kind: el.dataset.panel!,
          offsets: [
            x - r.left / cellPx,
            y - r.top / cellPx,
            right - r.right / cellPx,
            bottom - r.bottom / cellPx,
          ],
          corner: grid.cell(x, y).pinned,
          besideCorner: grid.cell(x + 1, y).pinned,
          middleIsWall: grid.cell(Math.floor((x + right) / 2), Math.floor((y + bottom) / 2)).wall,
          walled: "walled" in el.dataset,
        },
      ];
    });
  });

/**
 * Each Panel on screen has its border pinned along its HTML box, and its interior walled
 * only if it's a Frame holding media.
 */
async function expectPanelsInGrid(page: Page, kinds: string[]): Promise<void> {
  await expect
    .poll(async () => {
      const seen = await panelsSeen(page);
      return (
        seen.length > 0 &&
        seen.every(
          (p) =>
            p.corner &&
            p.besideCorner === (p.kind !== "dashed") &&
            p.middleIsWall === p.walled &&
            p.offsets.every((o) => Math.abs(o) <= 0.5),
        )
      );
    })
    .toBe(true);
  const seenKinds = new Set((await panelsSeen(page)).map((p) => p.kind));
  for (const kind of kinds) expect(seenKinds).toContain(kind);
}

test.describe("Panels in the Grid", () => {
  test("each Experience Entry's border is pinned along its HTML box, Life behind its text", async ({
    page,
  }) => {
    await page.goto("/experience/");
    await expectSection(page, "/experience/", "Experience");
    await expectPanelsInGrid(page, ["solid"]);
    await expectNoSidewaysScroll(page);
  });

  test("Home's tagline is a Panel once the Intro is done, clear of the drawn name", async ({
    page,
  }) => {
    await page.goto("/");
    await expectPanelsInGrid(page, ["solid"]);
    const nameClear = await page.evaluate(() => {
      const grid = window.gridTest!;
      const { cellPx, shapes } = grid.shapes();
      const tagline = shapes.find((s) => s.kind === "panel")!.box;
      // Nothing pinned in the row just above the border: the name sits clear of it.
      const above = tagline.y - 1;
      const border = document.querySelector("main [data-panel]")!.getBoundingClientRect();
      return (
        Math.round(border.top / cellPx) === tagline.y &&
        Array.from(
          { length: tagline.width },
          (_, i) => grid.cell(tagline.x + i, above).pinned,
        ).every((pinned) => !pinned)
      );
    });
    expect(nameClear).toBe(true);
    await expectNoSidewaysScroll(page);
  });

  test("Home's tagline Panel condenses in a Transition back to Home", async ({ page }) => {
    await page.goto("/about/");
    await expectSection(page, "/about/", "About");
    await navLink(page, "Home").click();
    await expect(page).toHaveURL(/\/$/);
    await expectPanelsInGrid(page, ["solid"]);
  });

  test("a Placeholder's border is dashed: every other cell pinned", async ({ page }) => {
    await page.goto("/about/");
    await expectSection(page, "/about/", "About");
    await expectPanelsInGrid(page, ["dashed"]);
  });

  test("Panels condense in a Transition and stay pinned once it's done", async ({ page }) => {
    await page.goto("/about/");
    await expectSection(page, "/about/", "About");
    await navLink(page, "Experience").click();
    await expectSection(page, "/experience/", "Experience");
    await expectPanelsInGrid(page, ["solid"]);
  });

  test("Panel borders follow their text as it scrolls, still on its HTML box", async ({ page }) => {
    await page.goto("/projects/baja/");
    await expectSection(page, "/projects/baja/", "Baja fuel-level estimator");
    const scrolled = await main(page).evaluate((el) => {
      const frame = el.querySelector(".frame-slot")!;
      el.scrollTop += frame.getBoundingClientRect().top - el.getBoundingClientRect().top - 40;
      return el.scrollTop;
    });
    expect(scrolled).toBeGreaterThan(0);
    await expectPanelsInGrid(page, ["dashed"]);
    // Part-way through a cell: the borders snap to the cells, half a cell off at most.
    await main(page).evaluate((el) => (el.scrollTop += 2.5));
    await expectPanelsInGrid(page, ["dashed"]);
  });
});

for (const colorScheme of ["dark", "light"] as const) {
  test.describe(`Panels in the Plain View (${colorScheme} theme)`, () => {
    test.use({ reducedMotion: "reduce", colorScheme });

    test("are thin borders in the theme's pinned green, dashed for Placeholders", async ({
      page,
    }) => {
      const accent = async () =>
        page.evaluate(() => {
          const probe = document.createElement("i");
          probe.style.color = "var(--accent)";
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        });
      const border = (selector: string) =>
        main(page)
          .locator(selector)
          .first()
          .evaluate((el) => {
            const s = getComputedStyle(el);
            return { width: s.borderTopWidth, style: s.borderTopStyle, color: s.borderTopColor };
          });

      await page.goto("/experience/");
      expect(await border("[data-panel]")).toEqual({
        width: "1px",
        style: "solid",
        color: await accent(),
      });
      await page.goto("/about/");
      expect(await border(".placeholder")).toEqual({
        width: "1px",
        style: "dashed",
        color: await accent(),
      });
      await page.goto("/projects/baja/");
      expect(await border(".frame-slot")).toMatchObject({ width: "1px", style: "dashed" });
      await expectNoSidewaysScroll(page);
    });
  });
}
