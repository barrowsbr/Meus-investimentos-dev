/**
 * Bulletproof canvas sizing for mobile (iOS Safari, Android Chrome).
 *
 * Strategy: use window.innerWidth/innerHeight as primary source (the canvas
 * is always full-viewport via CSS `position:fixed; inset:0`), set BOTH CSS
 * and buffer dimensions explicitly, check on every animation frame, and
 * listen to multiple resize signals with delayed re-checks for orientation
 * changes (iOS doesn't update dimensions synchronously).
 */

export interface CanvasState {
  width: number;
  height: number;
  dpr: number;
}

export function measureViewport(): { w: number; h: number } {
  const vv = window.visualViewport;
  const w = vv?.width || window.innerWidth || document.documentElement.clientWidth;
  const h = vv?.height || window.innerHeight || document.documentElement.clientHeight;
  return { w, h };
}

export function applySize(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  state: CanvasState,
): boolean {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { w, h } = measureViewport();
  if (w < 10 || h < 10) return false;
  if (w === state.width && h === state.height && dpr === state.dpr) return false;

  state.width = w;
  state.height = h;
  state.dpr = dpr;

  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return true;
}

export interface Cleanup {
  dispose: () => void;
}

/**
 * Attach every resize signal we can: ResizeObserver, window resize,
 * orientationchange (with delayed re-checks), and visualViewport resize.
 */
export function attachResizeListeners(
  canvas: HTMLCanvasElement,
  onResize: () => void,
): Cleanup {
  const ro = new ResizeObserver(onResize);
  ro.observe(canvas);

  const onWinResize = () => onResize();
  window.addEventListener("resize", onWinResize);

  let orientTimers: ReturnType<typeof setTimeout>[] = [];
  const onOrient = () => {
    onResize();
    const t1 = setTimeout(onResize, 100);
    const t2 = setTimeout(onResize, 300);
    const t3 = setTimeout(onResize, 600);
    orientTimers.push(t1, t2, t3);
  };
  window.addEventListener("orientationchange", onOrient);

  const onVV = () => onResize();
  window.visualViewport?.addEventListener("resize", onVV);

  return {
    dispose() {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
      window.removeEventListener("orientationchange", onOrient);
      window.visualViewport?.removeEventListener("resize", onVV);
      orientTimers.forEach(clearTimeout);
    },
  };
}
