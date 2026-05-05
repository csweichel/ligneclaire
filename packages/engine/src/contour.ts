import type { Point, Polyline } from "./document";
import { clamp, distanceBetweenPoints } from "./geometry";

export type ContinuousContourOptions = Readonly<{
  lanes: number;
  spacing: number;
  samplesPerSpan?: number;
  capSegments?: number;
  tension?: number;
}>;

function normalizeOptions(options: ContinuousContourOptions): Required<ContinuousContourOptions> {
  return {
    lanes: Math.max(1, Math.floor(options.lanes)),
    spacing: Math.max(0.1, options.spacing),
    samplesPerSpan: Math.max(2, Math.floor(options.samplesPerSpan ?? 32)),
    capSegments: Math.max(2, Math.floor(options.capSegments ?? 12)),
    tension: clamp(options.tension ?? 0, 0, 1),
  };
}

function dedupeControlPoints(points: readonly Point[]): Point[] {
  const result: Point[] = [];

  for (const point of points) {
    if (result.length > 0 && distanceBetweenPoints(result.at(-1)!, point) < 1e-6) {
      continue;
    }
    result.push({ x: point.x, y: point.y });
  }

  return result;
}

function lerpPoint(start: Point, end: Point, amount: number): Point {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  };
}

function sampleLinear(start: Point, end: Point, samplesPerSpan: number): Point[] {
  return Array.from({ length: samplesPerSpan + 1 }, (_, index) =>
    lerpPoint(start, end, index / samplesPerSpan)
  );
}

function catmullRom(
  previous: Point,
  start: Point,
  end: Point,
  next: Point,
  amount: number,
  tension: number
): Point {
  const amountSquared = amount * amount;
  const amountCubed = amountSquared * amount;
  const scale = 0.5 * (1 - tension);

  const tangentA = {
    x: (end.x - previous.x) * scale,
    y: (end.y - previous.y) * scale,
  };
  const tangentB = {
    x: (next.x - start.x) * scale,
    y: (next.y - start.y) * scale,
  };

  const h00 = 2 * amountCubed - 3 * amountSquared + 1;
  const h10 = amountCubed - 2 * amountSquared + amount;
  const h01 = -2 * amountCubed + 3 * amountSquared;
  const h11 = amountCubed - amountSquared;

  return {
    x: h00 * start.x + h10 * tangentA.x + h01 * end.x + h11 * tangentB.x,
    y: h00 * start.y + h10 * tangentA.y + h01 * end.y + h11 * tangentB.y,
  };
}

function sampleControlPath(points: readonly Point[], options: Required<ContinuousContourOptions>): Point[] {
  const deduped = dedupeControlPoints(points);
  if (deduped.length < 2) {
    return [];
  }

  if (deduped.length === 2) {
    return sampleLinear(deduped[0]!, deduped[1]!, options.samplesPerSpan);
  }

  const result: Point[] = [deduped[0]!];

  for (let index = 0; index < deduped.length - 1; index += 1) {
    const previous = deduped[Math.max(index - 1, 0)]!;
    const start = deduped[index]!;
    const end = deduped[index + 1]!;
    const next = deduped[Math.min(index + 2, deduped.length - 1)]!;

    for (let step = 1; step <= options.samplesPerSpan; step += 1) {
      result.push(catmullRom(previous, start, end, next, step / options.samplesPerSpan, options.tension));
    }
  }

  return result;
}

function normalizeVector(point: Point): Point {
  const length = Math.hypot(point.x, point.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: point.x / length,
    y: point.y / length,
  };
}

function computeFrames(points: readonly Point[]): Readonly<{
  tangents: readonly Point[];
  normals: readonly Point[];
}> {
  const tangents: Point[] = [];
  const normals: Point[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(index - 1, 0)]!;
    const next = points[Math.min(index + 1, points.length - 1)]!;
    const tangent = normalizeVector({
      x: next.x - previous.x,
      y: next.y - previous.y,
    });

    tangents.push(tangent);
    normals.push({
      x: -tangent.y,
      y: tangent.x,
    });
  }

  return { tangents, normals };
}

function laneOffsets(lanes: number, spacing: number): number[] {
  const center = (lanes - 1) * 0.5;
  return Array.from({ length: lanes }, (_, index) => (index - center) * spacing);
}

function offsetLane(centerline: readonly Point[], normals: readonly Point[], offset: number): Point[] {
  return centerline.map((point, index) => ({
    x: point.x + normals[index]!.x * offset,
    y: point.y + normals[index]!.y * offset,
  }));
}

function reversePoints(points: readonly Point[]): Point[] {
  return [...points].reverse();
}

function roundCap(
  endpoint: Point,
  tangent: Point,
  normal: Point,
  fromOffset: number,
  toOffset: number,
  direction: number,
  segments: number
): Point[] {
  if (Math.abs(fromOffset - toOffset) < 1e-9) {
    return [
      {
        x: endpoint.x + normal.x * toOffset,
        y: endpoint.y + normal.y * toOffset,
      },
    ];
  }

  const midpoint = 0.5 * (fromOffset + toOffset);
  const radius = 0.5 * Math.abs(toOffset - fromOffset);
  let startAngle = Math.PI;
  let endAngle = 0;

  if (toOffset < fromOffset) {
    startAngle = 0;
    endAngle = Math.PI;
  }

  return Array.from({ length: segments + 1 }, (_, index) => {
    const amount = index / segments;
    const angle = startAngle + (endAngle - startAngle) * amount;
    const offset = midpoint + radius * Math.cos(angle);
    const axial = direction * radius * Math.sin(angle);

    return {
      x: endpoint.x + normal.x * offset + tangent.x * axial,
      y: endpoint.y + normal.y * offset + tangent.y * axial,
    };
  });
}

function appendPath(target: Point[], source: readonly Point[]): Point[] {
  for (const point of source) {
    if (target.length > 0 && distanceBetweenPoints(target.at(-1)!, point) < 1e-6) {
      continue;
    }
    target.push(point);
  }

  return target;
}

export function generateContinuousContour(
  controlPoints: readonly Point[],
  options: ContinuousContourOptions
): Polyline {
  const normalized = normalizeOptions(options);
  const centerline = sampleControlPath(controlPoints, normalized);

  if (centerline.length < 2) {
    return { points: [...controlPoints] };
  }

  const { tangents, normals } = computeFrames(centerline);
  const offsets = laneOffsets(normalized.lanes, normalized.spacing);
  const points: Point[] = [];

  offsets.forEach((offset, laneIndex) => {
    const lane = offsetLane(centerline, normals, offset);
    appendPath(points, laneIndex % 2 === 0 ? lane : reversePoints(lane));

    if (laneIndex === offsets.length - 1) {
      return;
    }

    const cap =
      laneIndex % 2 === 0
        ? roundCap(
            centerline.at(-1)!,
            tangents.at(-1)!,
            normals.at(-1)!,
            offset,
            offsets[laneIndex + 1]!,
            1,
            normalized.capSegments
          )
        : roundCap(
            centerline[0]!,
            tangents[0]!,
            normals[0]!,
            offset,
            offsets[laneIndex + 1]!,
            -1,
            normalized.capSegments
          );
    appendPath(points, cap);
  });

  return { points };
}
