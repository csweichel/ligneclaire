import type { Point, Polyline } from "./document";
import { distanceBetweenPoints } from "./geometry";

export type Polygon = readonly Point[];

const EPSILON = 1e-6;

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > EPSILON) {
    return false;
  }

  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  if (dot < -EPSILON) {
    return false;
  }

  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= lengthSquared + EPSILON;
}

export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;

    if (pointOnSegment(point, start, end)) {
      return true;
    }

    const intersects =
      start.y > point.y !== end.y > point.y &&
      point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y + EPSILON) + start.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function segmentIntersections(start: Point, end: Point, polygon: Polygon): number[] {
  const result = [0, 1];
  const delta = {
    x: end.x - start.x,
    y: end.y - start.y,
  };

  for (let index = 0; index < polygon.length; index += 1) {
    const edgeStart = polygon[index]!;
    const edgeEnd = polygon[(index + 1) % polygon.length]!;
    const edgeDelta = {
      x: edgeEnd.x - edgeStart.x,
      y: edgeEnd.y - edgeStart.y,
    };
    const denominator = delta.x * edgeDelta.y - delta.y * edgeDelta.x;

    if (Math.abs(denominator) < EPSILON) {
      continue;
    }

    const startDelta = {
      x: edgeStart.x - start.x,
      y: edgeStart.y - start.y,
    };
    const segmentT = (startDelta.x * edgeDelta.y - startDelta.y * edgeDelta.x) / denominator;
    const edgeT = (startDelta.x * delta.y - startDelta.y * delta.x) / denominator;

    if (
      segmentT > EPSILON &&
      segmentT < 1 - EPSILON &&
      edgeT >= -EPSILON &&
      edgeT <= 1 + EPSILON
    ) {
      result.push(segmentT);
    }
  }

  return [...new Set(result.map((value) => Number.parseFloat(value.toFixed(8))))].sort(
    (left, right) => left - right
  );
}

function interpolatePoint(start: Point, end: Point, amount: number): Point {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  };
}

function splitSegmentByPolygon(
  start: Point,
  end: Point,
  polygon: Polygon,
  mode: "clip" | "exclude"
): readonly Readonly<{ start: Point; end: Point }>[] {
  if (polygon.length < 3) {
    return mode === "clip" ? [] : [{ start, end }];
  }

  const cuts = segmentIntersections(start, end, polygon);
  const segments: Array<Readonly<{ start: Point; end: Point }>> = [];

  for (let index = 1; index < cuts.length; index += 1) {
    const from = cuts[index - 1]!;
    const to = cuts[index]!;
    if (to - from <= EPSILON) {
      continue;
    }

    const midpoint = interpolatePoint(start, end, (from + to) * 0.5);
    const inside = pointInPolygon(midpoint, polygon);
    if ((mode === "clip" && !inside) || (mode === "exclude" && inside)) {
      continue;
    }

    const segmentStart = interpolatePoint(start, end, from);
    const segmentEnd = interpolatePoint(start, end, to);
    if (distanceBetweenPoints(segmentStart, segmentEnd) <= EPSILON) {
      continue;
    }

    segments.push({
      start: segmentStart,
      end: segmentEnd,
    });
  }

  return segments;
}

function applyPolygonMode(
  polyline: Polyline,
  polygon: Polygon,
  mode: "clip" | "exclude"
): readonly Polyline[] {
  if (polyline.points.length < 2) {
    return [];
  }

  const segments: Polyline[] = [];
  let current: Point[] = [];

  const flush = () => {
    if (current.length > 1) {
      segments.push({ points: current });
    }
    current = [];
  };

  for (let index = 1; index < polyline.points.length; index += 1) {
    const pieces = splitSegmentByPolygon(
      polyline.points[index - 1]!,
      polyline.points[index]!,
      polygon,
      mode
    );

    if (pieces.length === 0) {
      flush();
      continue;
    }

    for (const piece of pieces) {
      if (current.length === 0) {
        current.push(piece.start, piece.end);
        continue;
      }

      if (distanceBetweenPoints(current.at(-1)!, piece.start) <= EPSILON) {
        current.push(piece.end);
        continue;
      }

      flush();
      current.push(piece.start, piece.end);
    }
  }

  flush();
  return segments;
}

export function clipPolylineToPolygon(polyline: Polyline, polygon: Polygon): readonly Polyline[] {
  return applyPolygonMode(polyline, polygon, "clip");
}

export function excludePolylineFromPolygon(polyline: Polyline, polygon: Polygon): readonly Polyline[] {
  return applyPolygonMode(polyline, polygon, "exclude");
}
