/**
 * Ticker: runs the Grid's tick on animation frames, at a fixed interval, and not at
 * all while the tab is hidden.
 */

/** The parts of the browser the Ticker uses; `window` is one. */
export interface TickerHost {
  requestAnimationFrame(callback: (time: number) => void): number;
  cancelAnimationFrame(id: number): void;
  readonly document: {
    readonly hidden: boolean;
    addEventListener(type: "visibilitychange", listener: () => void): void;
  };
}

export interface Ticker {
  /** Wait a full interval from the next frame before ticking again, e.g. after a redraw outside a tick. */
  restart(): void;
}

/** Call `tick` at most once every `intervalMs` while the tab is visible. */
export function startTicker(tick: () => void, intervalMs: number, host: TickerHost = window): Ticker {
  let frameId: number | undefined;
  let last = -Infinity;
  let restarting = false;

  function frame(time: number): void {
    frameId = host.requestAnimationFrame(frame);
    if (restarting) {
      restarting = false;
      last = time;
      return;
    }
    if (time - last < intervalMs) return;
    last = time;
    tick();
  }

  function sync(): void {
    if (host.document.hidden) {
      if (frameId !== undefined) host.cancelAnimationFrame(frameId);
      frameId = undefined;
    } else if (frameId === undefined) {
      // Pick up where it left off, rather than racing through the ticks it missed.
      last = -Infinity;
      frameId = host.requestAnimationFrame(frame);
    }
  }

  host.document.addEventListener("visibilitychange", sync);
  sync();
  return {
    restart() {
      restarting = true;
    },
  };
}
