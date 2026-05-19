import type { Bounds, Point, Polyline } from "./document";
import { clamp, lerp, pointInBounds, sampleCatmullRomPolyline } from "./geometry";
import { createFractalNoise2D } from "./noise";

export type Vector = Readonly<{
  angle: number;
  length: number;
}>;

export type VectorField = Readonly<{
  bounds: Bounds;
  columns: number;
  rows: number;
  spacingX: number;
  spacingY: number;
  vectors: readonly (readonly Vector[])[];
}>;

export type VectorFieldTraceOptions = Readonly<{
  segmentLength: number;
  steps: number;
  bounds?: Bounds;
}>;

export type ContinuousVectorFieldTraceOptions = VectorFieldTraceOptions &
  Readonly<{
    samplesPerSpan?: number;
    tension?: number;
  }>;

type VectorFieldSamplingMode = "nearest" | "interpolated";

export function createVectorField(
  bounds: Bounds,
  options: Readonly<{
    columns: number;
    rows: number;
    sampler: (point: Point, cell: Readonly<{ column: number; row: number }>) => Vector;
  }>
): VectorField {
  const columns = Math.max(1, Math.floor(options.columns));
  const rows = Math.max(1, Math.floor(options.rows));
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const spacingX = columns > 1 ? width / (columns - 1) : width;
  const spacingY = rows > 1 ? height / (rows - 1) : height;

  const vectors = Array.from({ length: columns }, (_, column) =>
    Array.from({ length: rows }, (_, row) =>
      options.sampler(
        {
          x: bounds.minX + (columns === 1 ? width * 0.5 : column * spacingX),
          y: bounds.minY + (rows === 1 ? height * 0.5 : row * spacingY),
        },
        { column, row }
      )
    )
  );

  return {
    bounds,
    columns,
    rows,
    spacingX,
    spacingY,
    vectors,
  };
}

export function createPerlinVectorField(
  bounds: Bounds,
  options: Readonly<{
    columns: number;
    rows: number;
    seed: number | string;
    angleScale?: number;
    length?: number;
    frequency?: number;
    octaves?: number;
    persistence?: number;
    lacunarity?: number;
  }>
): VectorField {
  const width = Math.max(1e-6, bounds.maxX - bounds.minX);
  const height = Math.max(1e-6, bounds.maxY - bounds.minY);
  const frequency = options.frequency ?? 2.5;
  const noise = createFractalNoise2D(options.seed, {
    octaves: options.octaves ?? 3,
    persistence: options.persistence ?? 0.5,
    lacunarity: options.lacunarity ?? 2,
  });

  return createVectorField(bounds, {
    columns: options.columns,
    rows: options.rows,
    sampler(point) {
      const normalizedX = (point.x - bounds.minX) / width;
      const normalizedY = (point.y - bounds.minY) / height;
      const value = noise(normalizedX * frequency, normalizedY * frequency);

      return {
        angle: (value * 0.5 + 0.5) * Math.PI * 2 * (options.angleScale ?? 1),
        length: options.length ?? 8,
      };
    },
  });
}

export function sampleNearestVector(field: VectorField, point: Point): Vector | null {
  const position = locateVectorFieldPoint(field, point);
  if (!position) {
    return null;
  }

  const column = clamp(Math.round(position.column), 0, field.columns - 1);
  const row = clamp(Math.round(position.row), 0, field.rows - 1);

  return field.vectors[column]?.[row] ?? null;
}

function locateVectorFieldPoint(
  field: VectorField,
  point: Point
): Readonly<{
  column: number;
  row: number;
}> | null {
  if (!pointInBounds(point, field.bounds)) {
    return null;
  }

  const xRatio =
    field.columns <= 1
      ? 0
      : (point.x - field.bounds.minX) / Math.max(1e-6, field.bounds.maxX - field.bounds.minX);
  const yRatio =
    field.rows <= 1
      ? 0
      : (point.y - field.bounds.minY) / Math.max(1e-6, field.bounds.maxY - field.bounds.minY);

  return {
    column: clamp(xRatio * (field.columns - 1), 0, field.columns - 1),
    row: clamp(yRatio * (field.rows - 1), 0, field.rows - 1),
  };
}

function vectorToPoint(vector: Vector): Point {
  return {
    x: Math.cos(vector.angle) * vector.length,
    y: Math.sin(vector.angle) * vector.length,
  };
}

function pointToVector(delta: Point): Vector | null {
  const length = Math.hypot(delta.x, delta.y);
  if (length < 1e-6) {
    return null;
  }

  return {
    angle: Math.atan2(delta.y, delta.x),
    length,
  };
}

export function sampleInterpolatedVector(field: VectorField, point: Point): Vector | null {
  const position = locateVectorFieldPoint(field, point);
  if (!position) {
    return null;
  }

  const leftColumn = Math.floor(position.column);
  const rightColumn = Math.min(field.columns - 1, leftColumn + 1);
  const bottomRow = Math.floor(position.row);
  const topRow = Math.min(field.rows - 1, bottomRow + 1);
  const columnAmount = position.column - leftColumn;
  const rowAmount = position.row - bottomRow;
  const bottomLeft = field.vectors[leftColumn]?.[bottomRow];
  const bottomRight = field.vectors[rightColumn]?.[bottomRow];
  const topLeft = field.vectors[leftColumn]?.[topRow];
  const topRight = field.vectors[rightColumn]?.[topRow];

  if (!bottomLeft || !bottomRight || !topLeft || !topRight) {
    return null;
  }

  const bottomLeftDelta = vectorToPoint(bottomLeft);
  const bottomRightDelta = vectorToPoint(bottomRight);
  const topLeftDelta = vectorToPoint(topLeft);
  const topRightDelta = vectorToPoint(topRight);
  const interpolated = {
    x: lerp(
      lerp(bottomLeftDelta.x, bottomRightDelta.x, columnAmount),
      lerp(topLeftDelta.x, topRightDelta.x, columnAmount),
      rowAmount
    ),
    y: lerp(
      lerp(bottomLeftDelta.y, bottomRightDelta.y, columnAmount),
      lerp(topLeftDelta.y, topRightDelta.y, columnAmount),
      rowAmount
    ),
  };

  return pointToVector(interpolated) ?? sampleNearestVector(field, point);
}

export function drawVectorField(field: VectorField): readonly Polyline[] {
  const paths: Polyline[] = [];

  for (let column = 0; column < field.columns; column += 1) {
    for (let row = 0; row < field.rows; row += 1) {
      const vector = field.vectors[column]?.[row];
      if (!vector) {
        continue;
      }

      const start = {
        x: lerp(field.bounds.minX, field.bounds.maxX, field.columns === 1 ? 0.5 : column / (field.columns - 1)),
        y: lerp(field.bounds.minY, field.bounds.maxY, field.rows === 1 ? 0.5 : row / (field.rows - 1)),
      };
      const end = {
        x: start.x + Math.cos(vector.angle) * vector.length,
        y: start.y + Math.sin(vector.angle) * vector.length,
      };
      paths.push({
        points: [start, end],
      });
    }
  }

  return paths;
}

function traceFieldPath(
  field: VectorField,
  start: Point,
  options: VectorFieldTraceOptions,
  samplingMode: VectorFieldSamplingMode
): Polyline {
  const backward = traceFieldDirection(field, start, options, samplingMode, -1);
  const forward = traceFieldDirection(field, start, options, samplingMode, 1);

  return {
    points: [...backward.reverse(), start, ...forward],
  };
}

function sampleTraceVector(
  field: VectorField,
  point: Point,
  samplingMode: VectorFieldSamplingMode
): Vector | null {
  return samplingMode === "interpolated"
    ? sampleInterpolatedVector(field, point)
    : sampleNearestVector(field, point);
}

function traceFieldDirection(
  field: VectorField,
  start: Point,
  options: VectorFieldTraceOptions,
  samplingMode: VectorFieldSamplingMode,
  direction: 1 | -1
): Point[] {
  const points: Point[] = [];
  let current = start;

  for (let step = 0; step < options.steps; step += 1) {
    const vector = sampleTraceVector(field, current, samplingMode);
    if (!vector) {
      break;
    }

    const deltaX = Math.cos(vector.angle) * options.segmentLength * direction;
    const deltaY = Math.sin(vector.angle) * options.segmentLength * direction;
    const next = {
      x: current.x + deltaX,
      y: current.y + deltaY,
    };

    if (options.bounds && !pointInBounds(next, options.bounds)) {
      break;
    }

    points.push(next);
    current = next;
  }

  return points;
}

export function traceNearestVectorField(
  field: VectorField,
  start: Point,
  options: VectorFieldTraceOptions
): Polyline {
  return traceFieldPath(field, start, options, "nearest");
}

export function traceContinuousVectorField(
  field: VectorField,
  start: Point,
  options: ContinuousVectorFieldTraceOptions
): Polyline {
  const traced = traceFieldPath(field, start, options, "interpolated");
  if (traced.points.length < 2) {
    return traced;
  }

  return sampleCatmullRomPolyline(traced.points, {
    samplesPerSpan: options.samplesPerSpan ?? 6,
    tension: options.tension ?? 0.35,
  });
}
