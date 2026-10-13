/**
 * The test-only Section: built only when Placeholders are shown (`npm run dev` and the
 * test builds, see `placeholders.ts`), never in the live build. It always holds a dashed
 * Placeholder Panel, a Frame with no media and a solid Panel, so the tests for those
 * don't depend on which of Andrew's content is still unwritten. It's left out of the
 * nav and the Grid's content, and isn't listed in PLACEHOLDERS.md.
 */
export const TEST_SECTION = "/test-only/placeholders/";
