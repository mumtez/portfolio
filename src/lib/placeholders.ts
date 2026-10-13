/**
 * Whether Placeholders are built into the site. They show under `npm run dev`, so Andrew
 * sees what's left to write, and in the test builds (`SHOW_PLACEHOLDERS=true`); the live
 * build leaves them out, along with anything that would be left empty without them (a
 * Frame with no media yet, a block whose only content is a Placeholder).
 */
export const SHOW_PLACEHOLDERS: boolean =
  import.meta.env.DEV || process.env.SHOW_PLACEHOLDERS === "true";
