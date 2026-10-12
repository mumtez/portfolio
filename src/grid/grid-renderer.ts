/**
 * Grid Renderer: draws the Life Engine's readout to a Canvas2D. No logic beyond drawing.
 *
 * Only the viewport is drawn: rounded squares, no gridlines. Each colour's rounded square
 * is drawn once into a sprite at the device's pixel size and stamped for every cell,
 * which phones draw far faster than thousands of rounded paths per tick. Free Cells under
 * the Body Text are drawn faint and leave no ghosts there, so the HTML over them stays
 * readable. Walls (Frames) are left empty: real media cover them.
 */
import { boxContains, type Box } from "./box";
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
  private dpr = 1;
  /** One rounded cell per colour, in device pixels; redrawn after a resize or theme change. */
  private readonly sprites = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private _palette: Palette,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2D is not available");
    this.ctx = ctx;
    this.layers = Object.fromEntries(
      Object.entries(LAYERS).map(([name, l]) => [name, { ...l, cells: [] }]),
    ) as unknown as Record<keyof typeof LAYERS, Layer>;
  }

  /** The theme's colours; set it to switch theme, and the next draw uses it. */
  get palette(): Palette {
    return this._palette;
  }

  set palette(next: Palette) {
    this._palette = next;
    this.sprites.clear();
  }

  /** Size the canvas for a viewport of `width`×`height` cells of `cellPx` CSS pixels. */
  resize(width: number, height: number, cellPx: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.cellPx = cellPx;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * cellPx * dpr);
    this.canvas.height = Math.round(height * cellPx * dpr);
    this.canvas.style.width = `${width * cellPx}px`;
    this.canvas.style.height = `${height * cellPx}px`;
    this.sprites.clear();
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

    // Drawn in device pixels, at whole-pixel positions (cells are sized to whole device
    // pixels), so stamped sprites stay sharp.
    const step = this.cellPx * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (const { color, alpha, cells } of Object.values(layers)) {
      if (!cells.length) continue;
      const sprite = this.sprite(palette[color]);
      ctx.globalAlpha = alpha;
      for (let k = 0; k < cells.length; k += 2) {
        ctx.drawImage(sprite, Math.round(cells[k] * step), Math.round(cells[k + 1] * step));
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The rounded cell in `color`, drawn once at the current cell size. */
  private sprite(color: string): HTMLCanvasElement {
    let sprite = this.sprites.get(color);
    if (sprite) return sprite;
    const { cellPx, dpr } = this;
    const inset = cellPx >= 4 ? 0.5 : 0.25;
    const size = cellPx - 2 * inset;
    const radius = Math.max(0.6, cellPx * 0.28);
    sprite = document.createElement("canvas");
    sprite.width = sprite.height = Math.ceil(cellPx * dpr);
    const c = sprite.getContext("2d");
    if (!c) throw new Error("Canvas2D is not available");
    c.scale(dpr, dpr);
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(inset, inset, size, size, radius);
    c.fill();
    this.sprites.set(color, sprite);
    return sprite;
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
