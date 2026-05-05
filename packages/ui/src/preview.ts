import type { CanvasSpec, Point } from "@ligneclaire/engine";
import type { PreviewBridge } from "@ligneclaire/sdk";

export type PreviewLayout = Readonly<{
  scale: number;
  originX: number;
  originY: number;
  paperWidth: number;
  paperHeight: number;
  bridge: PreviewBridge;
}>;

export function createPreviewLayout(
  canvas: CanvasSpec,
  viewport: Readonly<{
    width: number;
    height: number;
  }>,
  options: Readonly<{
    zoom: number;
    panX: number;
    panY: number;
    padding?: number;
  }>
): PreviewLayout {
  const padding = options.padding ?? 28;
  const baseScale = Math.min(
    (viewport.width - padding * 2) / canvas.widthMm,
    (viewport.height - padding * 2) / canvas.heightMm
  );
  const safeScale = Math.max(baseScale, 0.1) * options.zoom;
  const paperWidth = canvas.widthMm * safeScale;
  const paperHeight = canvas.heightMm * safeScale;
  const originX = (viewport.width - paperWidth) / 2 + options.panX;
  const originY = (viewport.height - paperHeight) / 2 + options.panY;

  const toScreen = (point: Point): Point => ({
    x: point.x * safeScale,
    y: (canvas.heightMm - point.y) * safeScale,
  });

  const toCanvas = (point: Point): Point => ({
    x: point.x / safeScale,
    y: canvas.heightMm - point.y / safeScale,
  });

  return {
    scale: safeScale,
    originX,
    originY,
    paperWidth,
    paperHeight,
    bridge: {
      canvasToScreen: toScreen,
      screenToCanvas: toCanvas,
    },
  };
}
