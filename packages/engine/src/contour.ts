import type { Point, Polyline } from "./document";
import { clamp, distanceBetweenPoints, sampleCatmullRomPolyline } from "./geometry";

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
  const centerline = sampleCatmullRomPolyline(controlPoints, {
    samplesPerSpan: normalized.samplesPerSpan,
    tension: normalized.tension,
  }).points;

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
