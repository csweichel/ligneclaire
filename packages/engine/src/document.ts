export type Point = Readonly<{
  x: number;
  y: number;
}>;

export type Bounds = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

export type Polyline = Readonly<{
  points: readonly Point[];
  closed?: boolean;
}>;

export type PlotLayer = Readonly<{
  id: string;
  label: string;
  pen?: string;
  stroke?: string;
  paths: readonly Polyline[];
}>;

export type CanvasSpec = Readonly<{
  widthMm: number;
  heightMm: number;
  marginMm: number;
}>;

export type PlotDocument = Readonly<{
  canvas: CanvasSpec;
  layers: readonly PlotLayer[];
  debugLayers?: readonly PlotLayer[];
  metadata?: Readonly<Record<string, string>>;
}>;

export function canvasBounds(canvas: CanvasSpec): Bounds {
  return {
    minX: 0,
    minY: 0,
    maxX: canvas.widthMm,
    maxY: canvas.heightMm,
  };
}

export function contentBounds(canvas: CanvasSpec): Bounds {
  return {
    minX: canvas.marginMm,
    minY: canvas.marginMm,
    maxX: canvas.widthMm - canvas.marginMm,
    maxY: canvas.heightMm - canvas.marginMm,
  };
}

export function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

