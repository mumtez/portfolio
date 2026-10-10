/**
 * The link preview image (Open Graph / Twitter card): the name in Pinned Cells on a
 * living Grid, rendered to a PNG at build time (`pages/preview.png.ts`).
 *
 * It's a real Grid: the name is pinned in the Life Engine, a fixed random soup runs a
 * few dozen generations of B3/S23 around it, and the result is drawn in the dark theme.
 * The soup comes from a fixed seed, so every build makes the same image.
 */
import { crc32, deflateSync } from "node:zlib";
import { nameMask } from "../grid/cell-typesetter";
import { soupCells } from "../grid/intro-seeds";
import { CellKind, LifeEngine } from "../grid/life-engine";
import { DARK } from "../grid/palette";

/** The size LinkedIn, Slack, iMessage and X all crop well from. */
export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 630;
export const PREVIEW_ALT = "ANDREW ABURUSTUM drawn in green cells on a dark Game of Life grid";

const CELL_PX = 8;
const COLS = Math.ceil(PREVIEW_WIDTH / CELL_PX);
const ROWS = Math.ceil(PREVIEW_HEIGHT / CELL_PX);
const GENERATIONS = 40;
const SOUP_DENSITY = 0.3;
const SOUP_SEED = 0x5eed;
/** Cells of clear space kept around the name when the soup is laid, so the name reads cleanly. */
const NAME_CLEARANCE = 6;

/** A small deterministic PRNG (mulberry32), so the image is the same on every build. */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 0xff, n & 0xff];
}

/** Run the Grid and return each visible Cell's colour as [r, g, b], or undefined for background. */
function cellColours(): ([number, number, number] | undefined)[][] {
  const name = nameMask("one-line");
  const at = { x: Math.floor((COLS - name.width) / 2), y: Math.floor((ROWS - name.height) / 2) };
  const engine = new LifeEngine({ width: COLS, height: ROWS, margin: 8 });
  engine.setPinned(name.cells.map((p) => ({ x: p.x + at.x, y: p.y + at.y })));

  const area = { x: 0, y: 0, width: COLS, height: ROWS };
  const clearOfName = {
    x: at.x - NAME_CLEARANCE,
    y: at.y - NAME_CLEARANCE,
    width: name.width + 2 * NAME_CLEARANCE,
    height: name.height + 2 * NAME_CLEARANCE,
  };
  engine.inject(soupCells({ area, density: SOUP_DENSITY, random: seededRandom(SOUP_SEED) }, clearOfName));
  for (let i = 0; i < GENERATIONS; i++) engine.step();

  const bg = rgb(DARK.background);
  const blend = (hex: string, alpha: number) =>
    rgb(hex).map((c, i) => Math.round(bg[i] + (c - bg[i]) * alpha)) as [number, number, number];
  const pinned = rgb(DARK.pinned);
  // Dimmer than on the live Grid: at thumbnail size the name has to stand out at a glance.
  const free = blend(DARK.free, 0.6);
  const fringe = blend(DARK.free, 0.22);

  return Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => {
      switch (engine.kindAt(x, y)) {
        case CellKind.Pinned:
          return pinned;
        case CellKind.Free:
          return free;
        case CellKind.Fringe:
          return fringe;
        case CellKind.Ghost:
          return blend(DARK.free, engine.ghostAt(x, y) * 0.4);
        default:
          return undefined;
      }
    }),
  );
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** The preview image as PNG bytes. */
export function renderPreviewImage(): Buffer {
  const colours = cellColours();
  const bg = rgb(DARK.background);
  const rowBytes = 1 + PREVIEW_WIDTH * 3;
  const raw = Buffer.alloc(rowBytes * PREVIEW_HEIGHT);

  for (let py = 0; py < PREVIEW_HEIGHT; py++) {
    raw[py * rowBytes] = 0; // PNG filter: none
    const cy = Math.floor(py / CELL_PX);
    const iy = py % CELL_PX;
    for (let px = 0; px < PREVIEW_WIDTH; px++) {
      const cx = Math.floor(px / CELL_PX);
      const ix = px % CELL_PX;
      // Rounded squares with a one-pixel gap: no gridlines, corners cut.
      const inCell = ix < CELL_PX - 1 && iy < CELL_PX - 1;
      const corner = (ix === 0 || ix === CELL_PX - 2) && (iy === 0 || iy === CELL_PX - 2);
      const colour = (inCell && !corner && colours[cy][cx]) || bg;
      raw.set(colour, py * rowBytes + 1 + px * 3);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(PREVIEW_WIDTH, 0);
  header.writeUInt32BE(PREVIEW_HEIGHT, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
