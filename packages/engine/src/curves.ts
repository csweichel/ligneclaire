import type { Bounds, Point, Polyline } from "./document";
import { clamp } from "./geometry";
import { createRng } from "./rng";

type LSystemSpec = Readonly<{
  angleDeg: number;
  axiom: string;
  closed?: boolean;
  drawCommands?: readonly string[];
  rules: Readonly<Record<string, string>>;
  startAngleDeg?: number;
}>;

export type DelaunayTriangle = Readonly<{
  a: number;
  b: number;
  c: number;
}>;

export type DelaunayPathOptions = Readonly<{
  cols: number;
  jitter?: number;
  rows: number;
  seed: number | string;
}>;

export type DelaunayPathResult = Readonly<{
  paths: readonly Polyline[];
  points: readonly Point[];
  triangles: readonly DelaunayTriangle[];
}>;

type MutableTriangle = {
  a: number;
  b: number;
  c: number;
};

function almostEqual(left: Point, right: Point): boolean {
  return Math.abs(left.x - right.x) < 1e-6 && Math.abs(left.y - right.y) < 1e-6;
}

function appendPoint(target: Point[], point: Point): void {
  if (target.length > 0 && almostEqual(target.at(-1)!, point)) {
    return;
  }

  target.push(point);
}

function pointBounds(points: readonly Point[]): Bounds | null {
  if (points.length === 0) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function fitPolylineToBounds(polyline: Polyline, bounds: Bounds): Polyline {
  const rawBounds = pointBounds(polyline.points);
  if (!rawBounds) {
    return polyline;
  }

  const rawWidth = Math.max(1e-6, rawBounds.maxX - rawBounds.minX);
  const rawHeight = Math.max(1e-6, rawBounds.maxY - rawBounds.minY);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scale = Math.min(width / rawWidth, height / rawHeight);
  const scaledWidth = rawWidth * scale;
  const scaledHeight = rawHeight * scale;
  const offsetX = bounds.minX + (width - scaledWidth) * 0.5 - rawBounds.minX * scale;
  const offsetY = bounds.minY + (height - scaledHeight) * 0.5 - rawBounds.minY * scale;

  return {
    closed: polyline.closed,
    points: polyline.points.map((point) => ({
      x: offsetX + point.x * scale,
      y: offsetY + point.y * scale,
    })),
  };
}

function expandLSystem(
  axiom: string,
  rules: Readonly<Record<string, string>>,
  iterations: number
): string {
  let current = axiom;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let next = "";
    for (const symbol of current) {
      next += rules[symbol] ?? symbol;
    }
    current = next;
  }

  return current;
}

function traceTurtle(
  commands: string,
  angleDeg: number,
  startAngleDeg: number,
  drawCommands: readonly string[],
  closed = false
): Polyline {
  const angle = (angleDeg / 180) * Math.PI;
  const drawable = new Set(drawCommands);
  const stack: Array<{
    heading: number;
    point: Point;
  }> = [];
  const points: Point[] = [{ x: 0, y: 0 }];
  let current = { x: 0, y: 0 };
  let heading = (startAngleDeg / 180) * Math.PI;

  for (const command of commands) {
    if (drawable.has(command)) {
      current = {
        x: current.x + Math.cos(heading),
        y: current.y - Math.sin(heading),
      };
      appendPoint(points, current);
      continue;
    }

    switch (command) {
      case "+":
        heading += angle;
        break;
      case "-":
        heading -= angle;
        break;
      case "[":
        stack.push({
          heading,
          point: current,
        });
        break;
      case "]": {
        const state = stack.pop();
        if (!state) {
          break;
        }
        current = state.point;
        heading = state.heading;
        appendPoint(points, current);
        break;
      }
      default:
        break;
    }
  }

  return {
    closed,
    points,
  };
}

function generateLSystemPolyline(
  spec: LSystemSpec,
  iterations: number,
  bounds: Bounds
): Polyline {
  const traced = traceTurtle(
    expandLSystem(spec.axiom, spec.rules, Math.max(0, Math.floor(iterations))),
    spec.angleDeg,
    spec.startAngleDeg ?? 0,
    spec.drawCommands ?? ["F", "G"],
    Boolean(spec.closed)
  );

  return fitPolylineToBounds(traced, bounds);
}

export function generateKochCurve(
  iterations: number,
  bounds: Bounds,
  snowflake = false
): Polyline {
  return generateLSystemPolyline(
    {
      angleDeg: 60,
      axiom: snowflake ? "F--F--F" : "F",
      closed: snowflake,
      rules: {
        F: "F+F--F+F",
      },
    },
    iterations,
    bounds
  );
}

export function generateDragonCurve(iterations: number, bounds: Bounds): Polyline {
  return generateLSystemPolyline(
    {
      angleDeg: 90,
      axiom: "FX",
      rules: {
        X: "X+YF+",
        Y: "-FX-Y",
      },
    },
    iterations,
    bounds
  );
}

export function generateMooreCurve(order: number, bounds: Bounds): Polyline {
  return generateLSystemPolyline(
    {
      angleDeg: 90,
      axiom: "LFL+F+LFL",
      closed: true,
      rules: {
        L: "-RF+LFL+FR-",
        R: "+LF-RFR-FL+",
      },
    },
    order,
    bounds
  );
}

export function generatePeanoCurve(order: number, bounds: Bounds): Polyline {
  return generateLSystemPolyline(
    {
      angleDeg: 90,
      axiom: "L",
      rules: {
        L: "LFRFL-F-RFLFR+F+LFRFL",
        R: "RFLFR+F+LFRFL-F-RFLFR",
      },
    },
    order,
    bounds
  );
}

function cross(left: Point, right: Point, origin: Point): number {
  return (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
}

function orientTriangle(
  a: number,
  b: number,
  c: number,
  points: readonly Point[]
): MutableTriangle | null {
  const area = cross(points[b]!, points[c]!, points[a]!);
  if (Math.abs(area) < 1e-9) {
    return null;
  }

  return area > 0 ? { a, b, c } : { a, b: c, c: b };
}

function circumcircle(
  triangle: MutableTriangle,
  points: readonly Point[]
): Readonly<{
  center: Point;
  radiusSquared: number;
}> | null {
  const a = points[triangle.a]!;
  const b = points[triangle.b]!;
  const c = points[triangle.c]!;
  const denominator =
    2 *
    (a.x * (b.y - c.y) +
      b.x * (c.y - a.y) +
      c.x * (a.y - b.y));

  if (Math.abs(denominator) < 1e-9) {
    return null;
  }

  const aSquared = a.x * a.x + a.y * a.y;
  const bSquared = b.x * b.x + b.y * b.y;
  const cSquared = c.x * c.x + c.y * c.y;
  const center = {
    x:
      (aSquared * (b.y - c.y) +
        bSquared * (c.y - a.y) +
        cSquared * (a.y - b.y)) /
      denominator,
    y:
      (aSquared * (c.x - b.x) +
        bSquared * (a.x - c.x) +
        cSquared * (b.x - a.x)) /
      denominator,
  };
  const radiusSquared =
    (center.x - a.x) * (center.x - a.x) + (center.y - a.y) * (center.y - a.y);

  return {
    center,
    radiusSquared,
  };
}

function pointInCircumcircle(
  point: Point,
  triangle: MutableTriangle,
  points: readonly Point[]
): boolean {
  const circle = circumcircle(triangle, points);
  if (!circle) {
    return false;
  }

  const dx = point.x - circle.center.x;
  const dy = point.y - circle.center.y;
  return dx * dx + dy * dy <= circle.radiusSquared + 1e-6;
}

function jitteredGridPoints(
  bounds: Bounds,
  rows: number,
  cols: number,
  jitter: number,
  seed: number | string
): readonly Point[] {
  const rng = createRng(seed);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const stepX = cols > 1 ? width / (cols - 1) : 0;
  const stepY = rows > 1 ? height / (rows - 1) : 0;
  const maxOffsetX = stepX * jitter * 0.45;
  const maxOffsetY = stepY * jitter * 0.45;

  return Array.from({ length: rows * cols }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const base = {
      x: cols > 1 ? bounds.minX + stepX * col : bounds.minX + width * 0.5,
      y: rows > 1 ? bounds.minY + stepY * row : bounds.minY + height * 0.5,
    };
    const edge = row === 0 || row === rows - 1 || col === 0 || col === cols - 1;

    if (edge) {
      return base;
    }

    return {
      x: clamp(base.x + (rng.next() - 0.5) * maxOffsetX * 2, bounds.minX, bounds.maxX),
      y: clamp(base.y + (rng.next() - 0.5) * maxOffsetY * 2, bounds.minY, bounds.maxY),
    };
  });
}

function superTriangle(points: readonly Point[]): readonly Point[] {
  const bounds = pointBounds(points);
  if (!bounds) {
    return [
      { x: -1, y: -1 },
      { x: 0, y: 2 },
      { x: 1, y: -1 },
    ];
  }

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const delta = Math.max(width, height) || 1;
  const center = {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };

  return [
    { x: center.x - 64 * delta, y: center.y - 32 * delta },
    { x: center.x, y: center.y + 64 * delta },
    { x: center.x + 64 * delta, y: center.y - 32 * delta },
  ];
}

export function generateDelaunayPaths(
  bounds: Bounds,
  options: DelaunayPathOptions
): DelaunayPathResult {
  const rows = Math.max(2, Math.floor(options.rows));
  const cols = Math.max(2, Math.floor(options.cols));
  const jitter = clamp(options.jitter ?? 0.35, 0, 0.95);
  const points = jitteredGridPoints(bounds, rows, cols, jitter, options.seed);
  const workPoints = [...points, ...superTriangle(points)];
  const pointCount = points.length;
  const superStart = pointCount;
  const seedTriangle = orientTriangle(
    superStart,
    superStart + 1,
    superStart + 2,
    workPoints
  );
  if (!seedTriangle) {
    return {
      paths: [],
      points,
      triangles: [],
    };
  }

  let triangles: MutableTriangle[] = [seedTriangle];

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const point = workPoints[pointIndex]!;
    const badTriangles = triangles.filter((triangle) =>
      pointInCircumcircle(point, triangle, workPoints)
    );
    if (badTriangles.length === 0) {
      continue;
    }

    const badSet = new Set(badTriangles);
    const boundaryEdges = new Map<
      string,
      {
        a: number;
        b: number;
        count: number;
      }
    >();

    for (const triangle of badTriangles) {
      const edges: ReadonlyArray<readonly [number, number]> = [
        [triangle.a, triangle.b],
        [triangle.b, triangle.c],
        [triangle.c, triangle.a],
      ];

      for (const [start, end] of edges) {
        const a = Math.min(start, end);
        const b = Math.max(start, end);
        const key = `${a}:${b}`;
        const existing = boundaryEdges.get(key);

        if (existing) {
          existing.count += 1;
          continue;
        }

        boundaryEdges.set(key, {
          a,
          b,
          count: 1,
        });
      }
    }

    triangles = triangles.filter((triangle) => !badSet.has(triangle));

    for (const edge of [...boundaryEdges.values()]
      .filter((entry) => entry.count === 1)
      .sort((left, right) => left.a - right.a || left.b - right.b)) {
      const nextTriangle = orientTriangle(edge.a, edge.b, pointIndex, workPoints);
      if (nextTriangle) {
        triangles.push(nextTriangle);
      }
    }
  }

  const finalTriangles = triangles
    .filter(
      (triangle) =>
        triangle.a < pointCount && triangle.b < pointCount && triangle.c < pointCount
    )
    .map((triangle) => ({
      a: triangle.a,
      b: triangle.b,
      c: triangle.c,
    }));
  const edges = new Set<string>();
  const paths: Polyline[] = [];

  for (const triangle of finalTriangles) {
    const triangleEdges: ReadonlyArray<readonly [number, number]> = [
      [triangle.a, triangle.b],
      [triangle.b, triangle.c],
      [triangle.c, triangle.a],
    ];

    for (const [start, end] of triangleEdges) {
      const a = Math.min(start, end);
      const b = Math.max(start, end);
      const key = `${a}:${b}`;
      if (edges.has(key)) {
        continue;
      }
      edges.add(key);
      paths.push({
        points: [points[a]!, points[b]!],
      });
    }
  }

  paths.sort((left, right) => {
    const a0 = left.points[0]!;
    const b0 = right.points[0]!;
    const primary = a0.x - b0.x || a0.y - b0.y;
    if (Math.abs(primary) > 1e-6) {
      return primary;
    }

    const a1 = left.points[1]!;
    const b1 = right.points[1]!;
    return a1.x - b1.x || a1.y - b1.y;
  });

  return {
    paths,
    points,
    triangles: finalTriangles,
  };
}
