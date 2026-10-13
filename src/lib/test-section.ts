/**
 * The test-only Section: built only when Placeholders are shown (`npm run dev` and the
 * test builds, see `placeholders.ts`), never in the live build. It always holds a dashed
 * Placeholder Panel, a Frame with no media and a solid Panel, so the tests for those
 * don't depend on which of Andrew's content is still unwritten. It's left out of the
 * nav and the Grid's content, and its Placeholders aren't Andrew's to fill, so they
 * aren't in PLACEHOLDERS.md's lists.
 */

/** Its page's route parameter, under `src/pages/test-only/`. */
export const TEST_SECTION_SLUG = "placeholders";

/** Its URL path. */
export const TEST_SECTION = `/test-only/${TEST_SECTION_SLUG}/`;
