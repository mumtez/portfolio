/**
 * Grid Renderer: draws the Life Engine's readout to a Canvas2D. No logic beyond drawing.
 *
 * Only the viewport is drawn, and cells are batched into one path per colour and
 * opacity: rounded squares, no gridlines. Free Cells under the Body Text are drawn
 * faint and leave no ghosts there, so the HTML over them stays readable. Walls (Frames)
 * are left empty: real media cover them.
 */
import { boxContains, type Box } from "./cell-typesetter";
import { CellKind } from "./life-engine";
import { BODY_TEXT_CELL_ALPHA, type Palette } from "./palette";

/** The part of the Life Engine the renderer reads. */
export interface GridReadout {
  readonly width: number;
  readonly height: number;
  kindAt(x: number, y: number): CellKind;
  ghostAt(x: number, y: number): number;
}

interface Layer {
  color: keyof Palette;
  alpha: number;
  /** Flat [x0, y0, x1, y1, ...] of the cells in this layer, reused between frames. */
  cells: number[];
}

/** Draw order: faintest first, Pinned last. */
const LAYERS = {
  ghostFaint: { color: "free", alpha: 0.12 },
  ghostMid: { color: "free", alpha: 0.25 },
  ghostBright: { color: "free", alpha: 0.4 },
  fringe: { color: "free", alpha: 0.22 },
  underBodyText: { color: "free", alpha: BODY_TEXT_CELL_ALPHA },
  free: { color: "free", alpha: 1 },
  pinned: { color: "pinned", alpha: 1 },
} as const;

export class GridRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layers: Record<keyof typeof LAYERS, Layer>;
  private cellPx = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly palette: Palette,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2D is not available");
    this.ctx = ctx;
    this.layers = Object.fromEntries(
      Object.entries(LAYERS).map(([name, l]) => [name, { ...l, cells: [] }]),
    ) as unknown as Record<keyof typeof LAYERS, Layer>;
  }

  /** Size the canvas for a viewport of `width`×`height` cells of `cellPx` CSS pixels. */
  resize(width: number, height: number, cellPx: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.cellPx = cellPx;
    this.canvas.width = Math.round(width * cellPx * dpr);
    this.canvas.height = Math.round(height * cellPx * dpr);
    this.canvas.style.width = `${width * cellPx}px`;
    this.canvas.style.height = `${height * cellPx}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Draw the Grid; `bodyText` is where the Body Text lies over it, in cells. */
  draw(grid: GridReadout, bodyText?: Box): void {
    const { ctx, layers, palette } = this;
    for (const layer of Object.values(layers)) layer.cells.length = 0;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const layer = this.layerFor(grid, x, y, bodyText);
        if (layer) layer.cells.push(x, y);
      }
    }

    const { cellPx } = this;
    const inset = cellPx >= 4 ? 0.5 : 0.25;
    const size = cellPx - 2 * inset;
    const radius = Math.max(0.6, cellPx * 0.28);

    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, grid.width * cellPx, grid.height * cellPx);
    for (const { color, alpha, cells } of Object.values(layers)) {
      if (!cells.length) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = palette[color];
      ctx.beginPath();
      for (let k = 0; k < cells.length; k += 2) {
        ctx.roundRect(cells[k] * cellPx + inset, cells[k + 1] * cellPx + inset, size, size, radius);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private layerFor(grid: GridReadout, x: number, y: number, bodyText?: Box): Layer | undefined {
    const { layers } = this;
    const kind = grid.kindAt(x, y);
    if (kind !== CellKind.Pinned && bodyText && boxContains(bodyText, { x, y })) {
      return kind === CellKind.Free || kind === CellKind.Fringe ? layers.underBodyText : undefined;
    }
    switch (kind) {
      case CellKind.Pinned:
        return layers.pinned;
      case CellKind.Free:
        return layers.free;
      case CellKind.Fringe:
        return layers.fringe;
      case CellKind.Ghost: {
        const g = grid.ghostAt(x, y);
        return g > 0.5 ? layers.ghostBright : g > 0.2 ? layers.ghostMid : layers.ghostFaint;
      }
      default:
        return undefined;
    }
  }
}
