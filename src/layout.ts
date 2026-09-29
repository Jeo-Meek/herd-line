export const PLAY_W = 960;
export const PLAY_H = 720;
export const MIN_TAP_CSS = 44;
export const MIN_FONT_CSS = 16;

export type Insets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export type ViewLayout = {
  viewW: number;
  viewH: number;
  landscape: boolean;
  zoom: number;
  scrollX: number;
  scrollY: number;
  playScreenX: number;
  playScreenY: number;
  playScreenW: number;
  playScreenH: number;
  grassX: number;
  grassY: number;
  grassW: number;
  grassH: number;
  insets: Insets;
  hud: {
    pad: number;
    tap: number;
    font: number;
    smallFont: number;
    titleFont: number;
    pauseX: number;
    pauseY: number;
    inkX: number;
    inkY: number;
    inkW: number;
    inkH: number;
    countX: number;
    countY: number;
    timeX: number;
    timeY: number;
    warnX: number;
    warnY: number;
    overlayCx: number;
    overlayCy: number;
    overlayW: number;
    btnW: number;
    btnH: number;
  };
};

export function readSafeInsets(): Insets {
  if (typeof getComputedStyle === "undefined" || typeof document === "undefined") {
    return { ...ZERO_INSETS };
  }
  const cs = getComputedStyle(document.documentElement);
  const px = (name: string): number => {
    const n = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(n) ? n : 0;
  };
  return {
    top: px("--sat"),
    right: px("--sar"),
    bottom: px("--sab"),
    left: px("--sal"),
  };
}

/** Fit the 960×720 playfield as large as possible inside the safe inner rect. Extra space is grass. */
export function computeLayout(viewW: number, viewH: number, insets: Insets = ZERO_INSETS): ViewLayout {
  const w = Math.max(1, viewW);
  const h = Math.max(1, viewH);
  const left = Math.max(0, insets.left);
  const right = Math.max(0, insets.right);
  const top = Math.max(0, insets.top);
  const bottom = Math.max(0, insets.bottom);
  const landscape = w >= h;

  const safeX = left;
  const safeY = top;
  const safeW = Math.max(1, w - left - right);
  const safeH = Math.max(1, h - top - bottom);
  const zoom = Math.min(safeW / PLAY_W, safeH / PLAY_H);

  const playScreenW = PLAY_W * zoom;
  const playScreenH = PLAY_H * zoom;
  const playScreenX = safeX + (safeW - playScreenW) / 2;
  const playScreenY = safeY + (safeH - playScreenH) / 2;

  const scrollX = -playScreenX / zoom;
  const scrollY = -playScreenY / zoom;

  const worldViewW = w / zoom;
  const worldViewH = h / zoom;
  const grassX = scrollX - 64;
  const grassY = scrollY - 64;
  const grassW = worldViewW + 128;
  const grassH = worldViewH + 128;

  const tap = MIN_TAP_CSS;
  const pad = 8;
  const font = Math.max(MIN_FONT_CSS, Math.round(Math.min(h * 0.055, 22)));
  const smallFont = Math.max(MIN_FONT_CSS, font - 3);
  const titleFont = Math.max(22, Math.round(Math.min(h * 0.08, 32)));
  const pauseX = safeX + pad + tap / 2;
  const pauseY = safeY + pad + tap / 2;
  const inkH = 16;
  const inkW = Math.max(120, Math.min(240, safeW * 0.32));
  const inkX = pauseX + tap / 2 + 10;
  const inkY = pauseY;
  const countX = safeX + safeW - pad;
  const countY = safeY + pad;
  const timeX = countX;
  const timeY = countY + font + 4;
  const warnX = safeX + safeW / 2;
  const warnY = safeY + pad + 10;
  const overlayCx = w / 2;
  const overlayCy = h / 2;
  const overlayW = Math.min(420, safeW - pad * 2);
  const btnW = Math.min(300, overlayW - 40);
  const btnH = Math.max(tap, 48);

  return {
    viewW: w,
    viewH: h,
    landscape,
    zoom,
    scrollX,
    scrollY,
    playScreenX,
    playScreenY,
    playScreenW,
    playScreenH,
    grassX,
    grassY,
    grassW,
    grassH,
    insets: { top, right, bottom, left },
    hud: {
      pad,
      tap,
      font,
      smallFont,
      titleFont,
      pauseX,
      pauseY,
      inkX,
      inkY,
      inkW,
      inkH,
      countX,
      countY,
      timeX,
      timeY,
      warnX,
      warnY,
      overlayCx,
      overlayCy,
      overlayW,
      btnW,
      btnH,
    },
  };
}

export function bindVisualViewport(game: { scale: { refresh: () => void } }): () => void {
  const root = document.getElementById("game");
  let raf = 0;
  const apply = (): void => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const vv = window.visualViewport;
      if (root) {
        if (vv) {
          root.style.width = `${vv.width}px`;
          root.style.height = `${vv.height}px`;
          root.style.left = `${vv.offsetLeft}px`;
          root.style.top = `${vv.offsetTop}px`;
        } else {
          root.style.width = "100%";
          root.style.height = "100dvh";
          root.style.left = "0";
          root.style.top = "0";
        }
      }
      game.scale.refresh();
    });
  };
  apply();
  window.visualViewport?.addEventListener("resize", apply);
  window.visualViewport?.addEventListener("scroll", apply);
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  return () => {
    window.visualViewport?.removeEventListener("resize", apply);
    window.visualViewport?.removeEventListener("scroll", apply);
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
  };
}

export async function requestLandscapeFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: "hide" });
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    }
  } catch {
    /* iOS Safari: Fullscreen API is unavailable; visualViewport still handles chrome. */
  }
}
