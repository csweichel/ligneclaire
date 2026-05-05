import type { Bounds, Point, Polyline } from "./document";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

export function distanceBetweenPoints(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function pointInBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

export function expandBounds(bounds: Bounds, amount: number): Bounds {
  return {
    minX: bounds.minX - amount,
    minY: bounds.minY - amount,
    maxX: bounds.maxX + amount,
    maxY: bounds.maxY + amount,
  };
}

export function polylineLength(polyline: Polyline): number {
  let total = 0;

  for (let index = 1; index < polyline.points.length; index += 1) {
    total += distanceBetweenPoints(polyline.points[index - 1]!, polyline.points[index]!);
  }

  if (polyline.closed && polyline.points.length > 1) {
    total += distanceBetweenPoints(polyline.points.at(-1)!, polyline.points[0]!);
  }

  return total;
}

export function sampleQuadraticBezier(
  start: Point,
  control: Point,
  end: Point,
  segments = 32
): Polyline {
  const points = Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const mt = 1 - t;
    return {
      x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
      y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
    };
  });

  return { points };
}

export function sampleCubicBezier(
  start: Point,
  controlA: Point,
  controlB: Point,
  end: Point,
  segments = 48
): Polyline {
  const points = Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const mt = 1 - t;
    return {
      x:
        mt ** 3 * start.x +
        3 * mt * mt * t * controlA.x +
        3 * mt * t * t * controlB.x +
        t ** 3 * end.x,
      y:
        mt ** 3 * start.y +
        3 * mt * mt * t * controlA.y +
        3 * mt * t * t * controlB.y +
        t ** 3 * end.y,
    };
  });

  return { points };
}

export function sampleFunctionPath(
  sampler: (position: number) => Point,
  start: number,
  end: number,
  segments = 128
): Polyline {
  const step = (end - start) / segments;
  return {
    points: Array.from({ length: segments + 1 }, (_, index) => sampler(start + step * index)),
  };
}

export function resamplePolyline(polyline: Polyline, segmentLength: number): Polyline {
  if (polyline.points.length < 2 || segmentLength <= 0) {
    return polyline;
  }

  const output: Point[] = [polyline.points[0]!];
  let accumulated = 0;

  for (let index = 1; index < polyline.points.length; index += 1) {
    let segmentStart = polyline.points[index - 1]!;
    const segmentEnd = polyline.points[index]!;
    let remaining = distanceBetweenPoints(segmentStart, segmentEnd);

    while (accumulated + remaining >= segmentLength && remaining > 0) {
      const amount = (segmentLength - accumulated) / remaining;
      const nextPoint = {
        x: lerp(segmentStart.x, segmentEnd.x, amount),
        y: lerp(segmentStart.y, segmentEnd.y, amount),
      };
      output.push(nextPoint);
      segmentStart = nextPoint;
      remaining = distanceBetweenPoints(segmentStart, segmentEnd);
      accumulated = 0;
    }

    accumulated += remaining;
  }

  if (distanceBetweenPoints(output.at(-1)!, polyline.points.at(-1)!) > 0) {
    output.push(polyline.points.at(-1)!);
  }

  return {
    points: output,
    closed: polyline.closed,
  };
}

export function generateHilbertCurve(order: number, bounds: Bounds): Polyline {
  const size = 1 << order;

  function hilbertIndex(index: number): Point {
    let x = 0;
    let y = 0;
    let temp = index;

    for (let scale = 1; scale < size; scale *= 2) {
      const rx = 1 & (temp >> 1);
      const ry = 1 & (temp ^ rx);
      if (ry === 0) {
        if (rx === 1) {
          x = scale - 1 - x;
          y = scale - 1 - y;
        }
        [x, y] = [y, x];
      }
      x += scale * rx;
      y += scale * ry;
      temp >>= 2;
    }

    return { x, y };
  }

  const scaleX = (bounds.maxX - bounds.minX) / Math.max(1, size - 1);
  const scaleY = (bounds.maxY - bounds.minY) / Math.max(1, size - 1);
  const points = Array.from({ length: size * size }, (_, index) => {
    const point = hilbertIndex(index);
    return {
      x: bounds.minX + point.x * scaleX,
      y: bounds.minY + point.y * scaleY,
    };
  });

  return { points };
}

type VectorField = (point: Point, step: number) => Point;

export function traceVectorField(
  field: VectorField,
  start: Point,
  options: Readonly<{
    stepMm: number;
    steps: number;
    bounds?: Bounds;
  }>
): Polyline {
  const points: Point[] = [start];
  let current = start;

  for (let index = 0; index < options.steps; index += 1) {
    const delta = field(current, options.stepMm);
    current = {
      x: current.x + delta.x,
      y: current.y + delta.y,
    };

    if (options.bounds && !pointInBounds(current, options.bounds)) {
      break;
    }

    points.push(current);
  }

  return { points };
}

function segmentNormal(start: Point, end: Point): Point {
  const length = distanceBetweenPoints(start, end) || 1;
  return {
    x: -(end.y - start.y) / length,
    y: (end.x - start.x) / length,
  };
}

export function offsetPolyline(polyline: Polyline, offsetMm: number): Polyline {
  if (polyline.points.length < 2) {
    return polyline;
  }

  const points = polyline.points.map((point, index) => {
    const previous = polyline.points[Math.max(0, index - 1)]!;
    const next = polyline.points[Math.min(polyline.points.length - 1, index + 1)]!;
    const before = segmentNormal(previous, point);
    const after = segmentNormal(point, next);
    const normal = {
      x: (before.x + after.x) / 2,
      y: (before.y + after.y) / 2,
    };
    const length = Math.hypot(normal.x, normal.y) || 1;
    return {
      x: point.x + (normal.x / length) * offsetMm,
      y: point.y + (normal.y / length) * offsetMm,
    };
  });

  return {
    points,
    closed: polyline.closed,
  };
}

type ClippedSegment = Readonly<{
  start: Point;
  end: Point;
}>;

function clipSegmentToBounds(start: Point, end: Point, bounds: Bounds): ClippedSegment | null {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const checks: Array<[number, number]> = [
    [-deltaX, start.x - bounds.minX],
    [deltaX, bounds.maxX - start.x],
    [-deltaY, start.y - bounds.minY],
    [deltaY, bounds.maxY - start.y],
  ];

  let minT = 0;
  let maxT = 1;

  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) {
        return null;
      }
      continue;
    }

    const ratio = q / p;
    if (p < 0) {
      minT = Math.max(minT, ratio);
    } else {
      maxT = Math.min(maxT, ratio);
    }

    if (minT > maxT) {
      return null;
    }
  }

  return {
    start: {
      x: start.x + minT * deltaX,
      y: start.y + minT * deltaY,
    },
    end: {
      x: start.x + maxT * deltaX,
      y: start.y + maxT * deltaY,
    },
  };
}

export function clipPolylineToBounds(polyline: Polyline, bounds: Bounds): Polyline[] {
  if (polyline.points.length < 2) {
    return [];
  }

  const segments: Polyline[] = [];
  let currentPoints: Point[] = [];

  for (let index = 1; index < polyline.points.length; index += 1) {
    const clipped = clipSegmentToBounds(polyline.points[index - 1]!, polyline.points[index]!, bounds);
    if (!clipped) {
      if (currentPoints.length > 1) {
        segments.push({ points: currentPoints });
      }
      currentPoints = [];
      continue;
    }

    if (currentPoints.length === 0) {
      currentPoints.push(clipped.start);
    } else if (distanceBetweenPoints(currentPoints.at(-1)!, clipped.start) > 1e-6) {
      currentPoints.push(clipped.start);
    }

    currentPoints.push(clipped.end);
  }

  if (currentPoints.length > 1) {
    segments.push({ points: currentPoints });
  }

  return segments;
}

export function hatchBounds(
  bounds: Bounds,
  spacingMm: number,
  angleDegrees = 45
): readonly Polyline[] {
  const radians = (angleDegrees * Math.PI) / 180;
  const direction = { x: Math.cos(radians), y: Math.sin(radians) };
  const normal = { x: -direction.y, y: direction.x };
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };

  const lines: Polyline[] = [];
  for (let offset = -diagonal; offset <= diagonal; offset += spacingMm) {
    const anchor = {
      x: center.x + normal.x * offset,
      y: center.y + normal.y * offset,
    };
    const rawLine: Polyline = {
      points: [
        {
          x: anchor.x - direction.x * diagonal,
          y: anchor.y - direction.y * diagonal,
        },
        {
          x: anchor.x + direction.x * diagonal,
          y: anchor.y + direction.y * diagonal,
        },
      ],
    };
    lines.push(...clipPolylineToBounds(rawLine, bounds));
  }
  return lines;
}

