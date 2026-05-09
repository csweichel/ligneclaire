import type { Polygon } from "./clip";
import type { Bounds, Point, Polyline } from "./document";
import { clamp } from "./geometry";
import { createRng } from "./rng";

const EPSILON = 1e-6;
const TAU = Math.PI * 2;
const MAX_ARC_SEGMENT_LENGTH_MM = 1.4;

export type VoronoiNestedCellOptions = Readonly<{
  pointCount: number;
  seed: number | string;
  filletRadius?: number;
  layerCount?: number;
  scaleBase?: number;
  rotationStep?: number;
}>;

export type VoronoiNestedCellResult = Readonly<{
  boundary: Polygon;
  seedPoints: readonly Point[];
  cells: readonly Polygon[];
  roundedCells: readonly Polyline[];
  centroids: readonly Point[];
  paths: readonly Polyline[];
}>;

type NormalizedVoronoiNestedCellOptions = Readonly<{
  pointCount: number;
  seed: number | string;
  filletRadius: number;
  layerCount: number;
  scaleBase: number;
  rotationStep: number;
}>;

function normalizeOptions(
  options: VoronoiNestedCellOptions
): NormalizedVoronoiNestedCellOptions {
  return {
    pointCount: Math.max(1, Math.floor(options.pointCount)),
    seed: options.seed,
    filletRadius: Math.max(0, options.filletRadius ?? 0),
    layerCount: Math.max(1, Math.floor(options.layerCount ?? 1)),
    scaleBase: Math.max(0.01, options.scaleBase ?? 0.9),
    rotationStep: Number.isFinite(options.rotationStep ?? 0) ? options.rotationStep ?? 0 : 0,
  };
}

function addPoint(left: Point, right: Point): Point {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  };
}

function subtractPoint(left: Point, right: Point): Point {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
  };
}

function scalePoint(point: Point, amount: number): Point {
  return {
    x: point.x * amount,
    y: point.y * amount,
  };
}

function dotProduct(left: Point, right: Point): number {
  return left.x * right.x + left.y * right.y;
}

function polygonArea(points: readonly Point[]): number {
  if (points.length < 3) {
    return 0;
  }

  let total = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    total += current.x * next.y - next.x * current.y;
  }

  return total * 0.5;
}

function distanceBetween(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function normalizePoint(point: Point): Point {
  const length = Math.hypot(point.x, point.y);
  if (length < EPSILON) {
    return { x: 0, y: 0 };
  }

  return {
    x: point.x / length,
    y: point.y / length,
  };
}

function rotatePoint(point: Point, radians: number): Point {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function almostEqual(left: Point, right: Point): boolean {
  return Math.abs(left.x - right.x) < EPSILON && Math.abs(left.y - right.y) < EPSILON;
}

function appendUniquePoint(target: Point[], point: Point): void {
  if (target.length > 0 && almostEqual(target.at(-1)!, point)) {
    return;
  }

  target.push(point);
}

function normalizePolygon(points: readonly Point[]): Polygon {
  const deduped: Point[] = [];

  for (const point of points) {
    appendUniquePoint(deduped, point);
  }

  if (deduped.length > 1 && almostEqual(deduped[0]!, deduped.at(-1)!)) {
    deduped.pop();
  }

  if (deduped.length >= 3) {
    const cleaned: Point[] = [];

    for (let index = 0; index < deduped.length; index += 1) {
      const previous = deduped[(index - 1 + deduped.length) % deduped.length]!;
      const current = deduped[index]!;
      const next = deduped[(index + 1) % deduped.length]!;
      const incoming = normalizePoint(subtractPoint(current, previous));
      const outgoing = normalizePoint(subtractPoint(next, current));
      const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
      const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;

      if (Math.abs(cross) < EPSILON && dot > 0) {
        continue;
      }

      cleaned.push(current);
    }

    return cleaned;
  }

  return deduped;
}

function rectanglePolygon(bounds: Bounds): Polygon {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
}

function scatterPoints(bounds: Bounds, count: number, seed: number | string): readonly Point[] {
  const rng = createRng(seed);

  return Array.from({ length: count }, () => ({
    x: rng.float(bounds.minX, bounds.maxX),
    y: rng.float(bounds.minY, bounds.maxY),
  }));
}

function halfPlaneValue(point: Point, midpoint: Point, normal: Point): number {
  return dotProduct(subtractPoint(point, midpoint), normal);
}

function segmentHalfPlaneIntersection(
  start: Point,
  end: Point,
  midpoint: Point,
  normal: Point
): Point {
  const startValue = halfPlaneValue(start, midpoint, normal);
  const endValue = halfPlaneValue(end, midpoint, normal);
  const denominator = startValue - endValue;

  if (Math.abs(denominator) < EPSILON) {
    return {
      x: (start.x + end.x) * 0.5,
      y: (start.y + end.y) * 0.5,
    };
  }

  const amount = clamp(startValue / denominator, 0, 1);
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  };
}

function clipPolygonToHalfPlane(
  polygon: Polygon,
  midpoint: Point,
  normal: Point
): Polygon {
  if (polygon.length < 3) {
    return [];
  }

  const output: Point[] = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    const currentValue = halfPlaneValue(current, midpoint, normal);
    const nextValue = halfPlaneValue(next, midpoint, normal);
    const currentInside = currentValue <= EPSILON;
    const nextInside = nextValue <= EPSILON;

    if (currentInside && nextInside) {
      appendUniquePoint(output, next);
      continue;
    }

    if (currentInside && !nextInside) {
      appendUniquePoint(
        output,
        segmentHalfPlaneIntersection(current, next, midpoint, normal)
      );
      continue;
    }

    if (!currentInside && nextInside) {
      appendUniquePoint(
        output,
        segmentHalfPlaneIntersection(current, next, midpoint, normal)
      );
      appendUniquePoint(output, next);
    }
  }

  return normalizePolygon(output);
}

function buildVoronoiCell(
  boundary: Polygon,
  seedPoints: readonly Point[],
  focusIndex: number
): Polygon {
  let cell = boundary;
  const focus = seedPoints[focusIndex]!;

  for (let index = 0; index < seedPoints.length; index += 1) {
    if (index === focusIndex) {
      continue;
    }

    const other = seedPoints[index]!;
    if (distanceBetween(focus, other) < EPSILON) {
      continue;
    }

    cell = clipPolygonToHalfPlane(
      cell,
      {
        x: (focus.x + other.x) * 0.5,
        y: (focus.y + other.y) * 0.5,
      },
      subtractPoint(other, focus)
    );

    if (cell.length < 3 || Math.abs(polygonArea(cell)) < EPSILON) {
      return [];
    }
  }

  return cell;
}

function polygonCentroid(points: readonly Point[]): Point | null {
  if (points.length === 0) {
    return null;
  }

  const area = polygonArea(points);
  if (Math.abs(area) < EPSILON) {
    const total = points.reduce(
      (accumulator, point) => ({
        x: accumulator.x + point.x,
        y: accumulator.y + point.y,
      }),
      { x: 0, y: 0 }
    );

    return {
      x: total.x / points.length,
      y: total.y / points.length,
    };
  }

  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const cross = current.x * next.y - next.x * current.y;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  return {
    x: centroidX / (6 * area),
    y: centroidY / (6 * area),
  };
}

function sampleArc(
  center: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  orientation: number
): readonly Point[] {
  let adjustedEnd = endAngle;

  if (orientation >= 0) {
    while (adjustedEnd <= startAngle + EPSILON) {
      adjustedEnd += TAU;
    }
  } else {
    while (adjustedEnd >= startAngle - EPSILON) {
      adjustedEnd -= TAU;
    }
  }

  const delta = adjustedEnd - startAngle;
  const segmentCount = Math.max(
    2,
    Math.ceil((Math.abs(delta) * Math.max(radius, 0.5)) / MAX_ARC_SEGMENT_LENGTH_MM)
  );

  return Array.from({ length: segmentCount + 1 }, (_, index) => {
    const angle = startAngle + (delta * index) / segmentCount;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });
}

function filletClosedPolygon(polygon: Polygon, radius: number): Polyline {
  const points = normalizePolygon(polygon);

  if (points.length < 3 || radius <= EPSILON) {
    return {
      points,
      closed: true,
    };
  }

  const orientation = polygonArea(points) >= 0 ? 1 : -1;
  const output: Point[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const toPrevious = normalizePoint(subtractPoint(previous, current));
    const toNext = normalizePoint(subtractPoint(next, current));
    const prevLength = distanceBetween(previous, current);
    const nextLength = distanceBetween(current, next);
    const angleCosine = clamp(dotProduct(toPrevious, toNext), -1, 1);
    const angle = Math.acos(angleCosine);

    if (
      prevLength < EPSILON ||
      nextLength < EPSILON ||
      angle < 1e-4 ||
      Math.abs(Math.PI - angle) < 1e-4
    ) {
      appendUniquePoint(output, current);
      continue;
    }

    const tangentHalfAngle = Math.tan(angle * 0.5);
    if (Math.abs(tangentHalfAngle) < EPSILON) {
      appendUniquePoint(output, current);
      continue;
    }

    const trim = Math.min(radius / tangentHalfAngle, prevLength * 0.5, nextLength * 0.5);
    if (trim < EPSILON) {
      appendUniquePoint(output, current);
      continue;
    }

    const effectiveRadius = trim * tangentHalfAngle;
    const bisector = normalizePoint(addPoint(toPrevious, toNext));
    const sinHalfAngle = Math.sin(angle * 0.5);

    if (
      effectiveRadius < EPSILON ||
      (Math.abs(bisector.x) < EPSILON && Math.abs(bisector.y) < EPSILON) ||
      Math.abs(sinHalfAngle) < EPSILON
    ) {
      appendUniquePoint(output, current);
      continue;
    }

    const start = addPoint(current, scalePoint(toPrevious, trim));
    const end = addPoint(current, scalePoint(toNext, trim));
    const center = addPoint(current, scalePoint(bisector, effectiveRadius / sinHalfAngle));
    const arc = sampleArc(
      center,
      effectiveRadius,
      Math.atan2(start.y - center.y, start.x - center.x),
      Math.atan2(end.y - center.y, end.x - center.x),
      orientation
    );

    appendUniquePoint(output, arc[0]!);
    for (const point of arc.slice(1)) {
      appendUniquePoint(output, point);
    }
  }

  return {
    points: normalizePolygon(output),
    closed: true,
  };
}

function transformPolyline(
  polyline: Polyline,
  center: Point,
  scaleFactor: number,
  rotation: number
): Polyline {
  return {
    closed: polyline.closed,
    points: polyline.points.map((point) =>
      addPoint(
        center,
        rotatePoint(scalePoint(subtractPoint(point, center), scaleFactor), rotation)
      )
    ),
  };
}

export function generateVoronoiNestedCells(
  bounds: Bounds,
  options: VoronoiNestedCellOptions
): VoronoiNestedCellResult {
  const normalized = normalizeOptions(options);
  const boundary = rectanglePolygon(bounds);
  const seedPoints = scatterPoints(bounds, normalized.pointCount, normalized.seed);
  const cells: Polygon[] = [];
  const roundedCells: Polyline[] = [];
  const centroids: Point[] = [];
  const paths: Polyline[] = [];

  for (let index = 0; index < seedPoints.length; index += 1) {
    const cell = buildVoronoiCell(boundary, seedPoints, index);

    if (cell.length < 3 || Math.abs(polygonArea(cell)) < EPSILON) {
      continue;
    }

    const rounded = filletClosedPolygon(cell, normalized.filletRadius);
    const centroid = polygonCentroid(rounded.points) ?? polygonCentroid(cell) ?? seedPoints[index]!;

    cells.push(cell);
    roundedCells.push(rounded);
    centroids.push(centroid);

    for (let layerIndex = 0; layerIndex < normalized.layerCount; layerIndex += 1) {
      paths.push(
        transformPolyline(
          rounded,
          centroid,
          Math.pow(normalized.scaleBase, layerIndex),
          normalized.rotationStep * layerIndex
        )
      );
    }
  }

  return {
    boundary,
    seedPoints,
    cells,
    roundedCells,
    centroids,
    paths,
  };
}
