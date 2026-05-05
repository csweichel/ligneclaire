import { canvasBounds, type Bounds, type PlotDocument, type Point, type Polyline } from "./document";
import { distanceBetweenPoints, polylineLength } from "./geometry";

export type PlotMetrics = Readonly<{
  artLayerCount: number;
  debugLayerCount: number;
  pathCount: number;
  debugPathCount: number;
  segmentCount: number;
  debugSegmentCount: number;
  drawDistanceMm: number;
  debugDrawDistanceMm: number;
  penUpDistanceMm: number;
  debugPenUpDistanceMm: number;
  boundingBoxMm: Bounds | null;
  debugBoundingBoxMm: Bounds | null;
  canvasBoundsMm: Bounds;
}>;

function extendBounds(bounds: Bounds | null, point: Point): Bounds {
  if (!bounds) {
    return { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
  }

  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  };
}

function collectPolylineStats(polylines: readonly Polyline[]): Readonly<{
  pathCount: number;
  segmentCount: number;
  drawDistanceMm: number;
  penUpDistanceMm: number;
  bounds: Bounds | null;
}> {
  let pathCount = 0;
  let segmentCount = 0;
  let drawDistanceMm = 0;
  let penUpDistanceMm = 0;
  let bounds: Bounds | null = null;
  let previousEnd: Point | null = null;

  for (const polyline of polylines) {
    if (polyline.points.length < 2) {
      continue;
    }

    pathCount += 1;
    segmentCount += Math.max(0, polyline.points.length - 1) + (polyline.closed ? 1 : 0);
    drawDistanceMm += polylineLength(polyline);

    const start = polyline.points[0]!;
    const end = polyline.points.at(-1)!;

    if (previousEnd) {
      penUpDistanceMm += distanceBetweenPoints(previousEnd, start);
    }

    previousEnd = end;

    for (const point of polyline.points) {
      bounds = extendBounds(bounds, point);
    }
  }

  return {
    pathCount,
    segmentCount,
    drawDistanceMm,
    penUpDistanceMm,
    bounds,
  };
}

export function calculateDocumentMetrics(document: PlotDocument): PlotMetrics {
  const artPolylines = document.layers.flatMap((layer) => layer.paths);
  const debugPolylines = document.debugLayers?.flatMap((layer) => layer.paths) ?? [];
  const artStats = collectPolylineStats(artPolylines);
  const debugStats = collectPolylineStats(debugPolylines);

  return {
    artLayerCount: document.layers.length,
    debugLayerCount: document.debugLayers?.length ?? 0,
    pathCount: artStats.pathCount,
    debugPathCount: debugStats.pathCount,
    segmentCount: artStats.segmentCount,
    debugSegmentCount: debugStats.segmentCount,
    drawDistanceMm: artStats.drawDistanceMm,
    debugDrawDistanceMm: debugStats.drawDistanceMm,
    penUpDistanceMm: artStats.penUpDistanceMm,
    debugPenUpDistanceMm: debugStats.penUpDistanceMm,
    boundingBoxMm: artStats.bounds,
    debugBoundingBoxMm: debugStats.bounds,
    canvasBoundsMm: canvasBounds(document.canvas),
  };
}

