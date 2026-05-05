import type { Bounds, Point, Polyline } from "./document";
import { clamp, lerp, pointInBounds } from "./geometry";
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
  const column = clamp(Math.round(xRatio * (field.columns - 1)), 0, field.columns - 1);
  const row = clamp(Math.round(yRatio * (field.rows - 1)), 0, field.rows - 1);

  return field.vectors[column]?.[row] ?? null;
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

export function traceNearestVectorField(
  field: VectorField,
  start: Point,
  options: Readonly<{
    segmentLength: number;
    steps: number;
    bounds?: Bounds;
  }>
): Polyline {
  const points: Point[] = [start];
  let current = start;

  for (let step = 0; step < options.steps; step += 1) {
    const vector = sampleNearestVector(field, current);
    if (!vector) {
      break;
    }

    current = {
      x: current.x + Math.cos(vector.angle) * options.segmentLength,
      y: current.y + Math.sin(vector.angle) * options.segmentLength,
    };

    if (options.bounds && !pointInBounds(current, options.bounds)) {
      break;
    }

    points.push(current);
  }

  return { points };
}
