import type { Point, Polyline } from "./document";
import { distanceBetweenPoints, resamplePolyline } from "./geometry";

export type PolylineDeformationMode = "direction" | "normal";

export type PolylineDeformationSample = Readonly<{
  point: Point;
  index: number;
  count: number;
  t: number;
  arcLengthMm: number;
  tangent: Point;
  normal: Point;
}>;

export type PolylineDeformationOptions = Readonly<{
  segmentLength?: number;
  mode?: PolylineDeformationMode;
  direction?: Point;
  amount: (sample: PolylineDeformationSample) => number;
}>;

function normalizeVector(vector: Point, fallback: Point = { x: 1, y: 0 }): Point {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 1e-9) {
    return fallback;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function tangentForPoint(points: readonly Point[], index: number, closed: boolean): Point {
  if (points.length < 2) {
    return { x: 1, y: 0 };
  }

  const previous = closed
    ? points[(index - 1 + points.length) % points.length]!
    : points[Math.max(0, index - 1)]!;
  const next = closed
    ? points[(index + 1) % points.length]!
    : points[Math.min(points.length - 1, index + 1)]!;
  const blended = {
    x: next.x - previous.x,
    y: next.y - previous.y,
  };

  if (Math.hypot(blended.x, blended.y) >= 1e-9) {
    return normalizeVector(blended);
  }

  if (index < points.length - 1) {
    return normalizeVector({
      x: points[index + 1]!.x - points[index]!.x,
      y: points[index + 1]!.y - points[index]!.y,
    });
  }

  return normalizeVector({
    x: points[index]!.x - points[index - 1]!.x,
    y: points[index]!.y - points[index - 1]!.y,
  });
}

function collectArcLengths(points: readonly Point[]): readonly number[] {
  const lengths: number[] = [0];
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    total += distanceBetweenPoints(points[index - 1]!, points[index]!);
    lengths.push(total);
  }

  return lengths;
}

export function deformPolyline(
  polyline: Polyline,
  options: PolylineDeformationOptions
): Polyline {
  if (polyline.points.length < 2) {
    return polyline;
  }

  const sampled =
    options.segmentLength && options.segmentLength > 0
      ? resamplePolyline(polyline, options.segmentLength)
      : polyline;
  const arcLengths = collectArcLengths(sampled.points);
  const totalLength = arcLengths.at(-1) ?? 0;
  const mode = options.mode ?? "normal";
  const fixedDirection =
    mode === "direction" ? normalizeVector(options.direction ?? { x: 1, y: 0 }) : null;

  return {
    points: sampled.points.map((point, index) => {
      const tangent = tangentForPoint(sampled.points, index, Boolean(sampled.closed));
      const normal = {
        x: -tangent.y,
        y: tangent.x,
      };
      const sample: PolylineDeformationSample = {
        point,
        index,
        count: sampled.points.length,
        t: totalLength <= 1e-9 ? 0 : arcLengths[index]! / totalLength,
        arcLengthMm: arcLengths[index] ?? 0,
        tangent,
        normal,
      };
      const amount = options.amount(sample);
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      const direction = fixedDirection ?? normal;

      return {
        x: point.x + direction.x * safeAmount,
        y: point.y + direction.y * safeAmount,
      };
    }),
    closed: sampled.closed,
  };
}
