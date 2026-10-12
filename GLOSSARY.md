# Game of Life Portfolio

Andrew Aburustum's portfolio site, where the whole page is a Conway's Game of Life grid and the name, navigation, buttons and panel borders are drawn in cells.

## Language

### The simulation

**Grid**:
The single full-screen Game of Life world that is the page. There is one Grid; Sections are states of it, not separate pages of it.
_Avoid_: Board, canvas, background

**Cell**:
One square of the Grid, alive or dead, following B3/S23 rules unless it is a Pinned Cell.
_Avoid_: Pixel, dot

**Pinned Cell**:
A Cell held alive regardless of the rules, so that content drawn in cells stays readable. Free Cells interact with Pinned Cells as if they were ordinary live Cells.
_Avoid_: Static cell, frozen cell, locked cell

**Free Cell**:
Any Cell that is not pinned and obeys the rules normally.
_Avoid_: Background cell

**Fringe**:
The Free Cells bordering Pinned Cells, continually reborn because the Pinned Cells count as live neighbours. Every piece of pinned content has one.
_Avoid_: Halo, glow, noise

**Ghost**:
A dead Cell that died recently and is still fading, drawn as a trail behind moving patterns. The Fringe never leaves Ghosts, so pinned content stays clean.
_Avoid_: Afterimage, echo, shadow

**Set Piece**:
A deliberate showcase moment of the Grid, choreographed rather than ambient. Runs by strict B3/S23 where feasible; may use Pinned Cells to guide it otherwise.

**Intro**:
The Set Piece on first load in which Andrew's name forms out of random soup and then pins.
_Avoid_: Splash, loading animation

**Intro Seed**:
A starting pattern, found ahead of time, that evolves into the name under strict B3/S23. The Intro draws one at random from a pool, so each visit forms the name differently.
_Avoid_: Preset, starting state

### Content

**Section**:
A named content state of the Grid with its own URL (e.g. `/projects/baja`). Navigating between Sections is a Transition, not a page load.
_Avoid_: Page, screen, view

**Transition**:
The Grid evolving from one Section to the next: the old Section's Pinned Cells and the shapes of its Body Text dissolve into Life, and the next Section's condense out of it.

**Deep Dive**:
A Section that tells one project's story beyond the resume bullet (FTC RoboRebels, Baja fuel estimator, FTC Event Viewer).
_Avoid_: Case study, project page

**Body Text**:
Paragraph-length writing in a Section, such as a Deep Dive's story. It is real HTML laid over the live Grid, never drawn in Cells.
_Avoid_: Copy, prose, description

**Shape**:
Where a piece of Body Text lies over the Grid, in Cells: one line of its text, or a Panel. A Transition dissolves the old Section's Shapes and condenses the next one's.
_Avoid_: Region, outline, footprint

**Button**:
Something to press, inside a pinned border of Cells: its label is drawn in Pinned Cells (a nav item, a toggle, a Cell label) or is Body Text (a Project Entry). Hovering or focusing it briefly releases the border to decay under Life before it pins again. Underneath it is a real link or button.
_Avoid_: Tile, chip

**Frame**:
A region of a Section reserved for real media (photos, video), where no Cells live and the Grid steps around it. In the Life Engine its Cells are **walls**: always dead and counted as dead neighbours, so whatever flies in is absorbed.
_Avoid_: Embed, media box

**Panel**:
A block of Body Text set inside a pinned border of Cells, such as a Frame, a Placeholder or an Entry. The text inside stays HTML; only the border lives in the Grid, and Life carries on behind the text, drawn faint. Only a Frame holding media walls off its interior.
_Avoid_: Card, box, container

**Button Panel**:
A Panel that is also a Button: pressing it follows its link, and its border decays on hover or focus. A Project Entry and a Contact link are Button Panels.
_Avoid_: Card link, clickable card

**Cell label**:
A short label in capitals drawn in Pinned Cells inside a Button Panel's border, standing in for its link's full text (EMAIL for the email address). It stays pinned while the border decays.
_Avoid_: Badge, tag, caption

**Entry**:
One item in a list Section: a job on Experience, or a project on Projects.
_Avoid_: Item, row, listing

**Placeholder**:
A marked gap in a Section waiting for Andrew's own words or media.
_Avoid_: Stub, TODO, lorem

**Plain View**:
The same content as semantic HTML with no running simulation, shown to screen readers, crawlers, reduced-motion visitors, and anyone who toggles the simulation off.
_Avoid_: Fallback, lite mode, accessible version
