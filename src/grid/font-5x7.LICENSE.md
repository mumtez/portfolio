# Licence: the Grid's 5×7 cell font

`src/grid/font-5x7.ts` draws headings, nav and button labels in Pinned Cells. Its glyphs come from the X11 **misc-fixed 6x10** bitmap font, whose 5×7 capitals, digits and punctuation sit in a 6×10 cell.

- **Font:** `-Misc-Fixed-Medium-R-Normal--10-100-75-75-C-60-ISO10646-1` (`6x10.bdf`, `$ucs-fonts: 6x10.bdf,v 1.35 2006-01-05 mgk25 Rel $`), maintained by Markus Kuhn as part of the X.Org `font/misc-misc` package.
- **Source:** <https://gitlab.freedesktop.org/xorg/font/misc-misc/-/raw/master/6x10.bdf> (SHA-256 `99abf27fa2ca5a5171cad3df13aed2d4c55e73698cb141981b3e2268c733f64c` when copied).
- **Licence:** public domain. The font's `COPYRIGHT` property reads:

  > Public domain terminal emulator font.  Share and enjoy.

  The package's `COPYING` file says the same of the misc-misc fonts: "Public domain font.  Share and enjoy."

No attribution is required. This file keeps the provenance on record so the font's status can be checked.

The name glyphs (`NAME_GLYPHS` in `cell-typesetter.ts`) are not from this font. They were hand-drawn for this site in the prototype and are frozen because the Intro Seeds depend on them (ADR 0003).
