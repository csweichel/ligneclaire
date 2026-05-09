import type { Bounds, Point, Polyline } from "./document";
import { expandBounds, sampleQuadraticBezier } from "./geometry";
import { createRng } from "./rng";

export type HamiltonPathOptions = Readonly<{
  rows: number;
  cols: number;
  seed: number | string;
  strokeCount?: number;
  strokeSpacing?: number;
  drawCenterlines?: boolean;
  cornerRadius?: number;
  deflection?: number;
  mixSteps?: number;
}>;

export type HamiltonPathResult = Readonly<{
  centerline: Polyline;
  paths: readonly Polyline[];
  rows: number;
  cols: number;
  cellSize: number;
  gridBounds: Bounds;
}>;

type NormalizedHamiltonPathOptions = Readonly<{
  rows: number;
  cols: number;
  seed: number | string;
  strokeCount: number;
  strokeSpacing: number;
  drawCenterlines: boolean;
  cornerRadius: number;
  deflection: number;
  mixSteps: number;
}>;

function normalizeOptions(options: HamiltonPathOptions): NormalizedHamiltonPathOptions {
  const rows = Math.max(1, Math.floor(options.rows));
  const cols = Math.max(1, Math.floor(options.cols));
  const strokeCount = Math.max(1, Math.floor(options.strokeCount ?? 1));
  const strokeSpacing = Math.max(0, options.strokeSpacing ?? 0.6);
  const cornerRadius = Math.max(0, options.cornerRadius ?? 0);
  const deflection = Math.max(0, options.deflection ?? 0);
  const cellCount = rows * cols;
  const defaultMixSteps = Math.min(Math.max(cellCount * 8, 256), 24000);

  return {
    rows,
    cols,
    seed: options.seed,
    strokeCount,
    strokeSpacing,
    drawCenterlines: Boolean(options.drawCenterlines),
    cornerRadius,
    deflection,
    mixSteps: Math.max(0, Math.floor(options.mixSteps ?? defaultMixSteps)),
  };
}

function emptyResult(gridBounds: Bounds, options: NormalizedHamiltonPathOptions): HamiltonPathResult {
  return {
    centerline: { points: [] },
    paths: [],
    rows: options.rows,
    cols: options.cols,
    cellSize: 0,
    gridBounds,
  };
}

function parallelStrokeOffsets(
  strokeCount: number,
  strokeSpacing: number,
  drawCenterlines: boolean
): number[] {
  const lineCount = drawCenterlines ? Math.max(0, strokeCount - 1) : strokeCount;
  const center = (lineCount - 1) * 0.5;

  return Array.from(
    { length: lineCount },
    (_, index) => (index - center) * strokeSpacing
  );
}

function addPoint(left: Point, right: Point): Point {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  };
}

function scalePoint(point: Point, amount: number): Point {
  return {
    x: point.x * amount,
    y: point.y * amount,
  };
}

function subtractPoint(left: Point, right: Point): Point {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
  };
}

function normalizePoint(point: Point): Point {
  const length = Math.hypot(point.x, point.y);
  if (length < 1e-9) {
    return { x: 0, y: 0 };
  }

  return {
    x: point.x / length,
    y: point.y / length,
  };
}

function distanceBetween(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function almostEqual(left: Point, right: Point): boolean {
  return Math.abs(left.x - right.x) < 1e-6 && Math.abs(left.y - right.y) < 1e-6;
}

function appendPoint(target: Point[], point: Point): Point[] {
  if (target.length > 0 && almostEqual(target.at(-1)!, point)) {
    return target;
  }

  target.push(point);
  return target;
}

function axisDirection(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: dx >= 0 ? 1 : -1,
      y: 0,
    };
  }

  return {
    x: 0,
    y: dy >= 0 ? 1 : -1,
  };
}

function segmentNormal(direction: Point): Point {
  return {
    x: -direction.y,
    y: direction.x,
  };
}

function directionEquals(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}

function cornerDeflectionDirection(prevNormal: Point, nextNormal: Point, offset: number): Point {
  const base = normalizePoint(addPoint(prevNormal, nextNormal));
  if (base.x === 0 && base.y === 0) {
    return base;
  }

  return offset < -1e-9 ? scalePoint(base, -1) : base;
}

function buildLanePolyline(
  centerline: Polyline,
  offset: number,
  deflection: number
): Polyline {
  if (centerline.points.length < 2) {
    return centerline;
  }

  const directions = Array.from(
    { length: centerline.points.length - 1 },
    (_, index) => axisDirection(centerline.points[index]!, centerline.points[index + 1]!)
  );
  const normals = directions.map((direction) => segmentNormal(direction));
  const points: Point[] = [];

  appendPoint(points, addPoint(centerline.points[0]!, scalePoint(normals[0]!, offset)));

  for (let index = 1; index < centerline.points.length - 1; index += 1) {
    const center = centerline.points[index]!;
    const prevDirection = directions[index - 1]!;
    const nextDirection = directions[index]!;
    const prevNormal = normals[index - 1]!;
    const nextNormal = normals[index]!;

    if (directionEquals(prevDirection, nextDirection)) {
      appendPoint(points, addPoint(center, scalePoint(prevNormal, offset)));
      continue;
    }

    let corner = addPoint(
      center,
      scalePoint(addPoint(prevNormal, nextNormal), offset)
    );
    if (deflection > 0) {
      corner = addPoint(
        corner,
        scalePoint(cornerDeflectionDirection(prevNormal, nextNormal, offset), deflection)
      );
    }

    appendPoint(points, corner);
  }

  appendPoint(
    points,
    addPoint(centerline.points.at(-1)!, scalePoint(normals.at(-1)!, offset))
  );

  return { points };
}

function roundCornerSegments(radius: number): number {
  return Math.max(2, Math.ceil((Math.PI * radius) / 1.6));
}

function turnSign(previous: Point, current: Point, next: Point): number {
  const incoming = normalizePoint(subtractPoint(current, previous));
  const outgoing = normalizePoint(subtractPoint(next, current));
  const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;

  if (cross > 1e-6) {
    return 1;
  }
  if (cross < -1e-6) {
    return -1;
  }

  return 0;
}

function roundPolylineCorners(polyline: Polyline, baseRadius: number, offset = 0): Polyline {
  if (baseRadius <= 0 || polyline.points.length < 3) {
    return polyline;
  }

  const points = polyline.points;
  const output: Point[] = [points[0]!];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const prevLength = distanceBetween(previous, current);
    const nextLength = distanceBetween(current, next);

    if (prevLength < 1e-6 || nextLength < 1e-6) {
      appendPoint(output, current);
      continue;
    }

    const toPrevious = normalizePoint(subtractPoint(previous, current));
    const toNext = normalizePoint(subtractPoint(next, current));
    const dot = toPrevious.x * toNext.x + toPrevious.y * toNext.y;
    if (Math.abs(Math.abs(dot) - 1) < 1e-6) {
      appendPoint(output, current);
      continue;
    }

    const adjustedRadius = Math.max(
      0,
      baseRadius - turnSign(previous, current, next) * offset
    );
    const trim = Math.min(adjustedRadius, prevLength * 0.5, nextLength * 0.5);
    if (trim < 1e-6) {
      appendPoint(output, current);
      continue;
    }

    const start = addPoint(current, scalePoint(toPrevious, trim));
    const end = addPoint(current, scalePoint(toNext, trim));
    appendPoint(output, start);

    const rounded = sampleQuadraticBezier(
      start,
      current,
      end,
      roundCornerSegments(trim)
    ).points;
    for (const point of rounded.slice(1)) {
      appendPoint(output, point);
    }
  }

  appendPoint(output, points.at(-1)!);

  return { points: output, closed: polyline.closed };
}

function buildNeighborTable(rows: number, cols: number): readonly number[][] {
  return Array.from({ length: rows * cols }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const neighbors: number[] = [];

    if (row > 0) {
      neighbors.push(index - cols);
    }
    if (col + 1 < cols) {
      neighbors.push(index + 1);
    }
    if (row + 1 < rows) {
      neighbors.push(index + cols);
    }
    if (col > 0) {
      neighbors.push(index - 1);
    }

    return neighbors;
  });
}

function snakeHamiltonPath(rows: number, cols: number): number[] {
  const path: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    if (row % 2 === 0) {
      for (let col = 0; col < cols; col += 1) {
        path.push(row * cols + col);
      }
      continue;
    }

    for (let col = cols - 1; col >= 0; col -= 1) {
      path.push(row * cols + col);
    }
  }

  return path;
}

function reverseRange(path: number[], positions: number[], start: number, end: number): void {
  let left = start;
  let right = end;

  while (left < right) {
    const leftValue = path[left]!;
    const rightValue = path[right]!;
    path[left] = rightValue;
    path[right] = leftValue;
    positions[rightValue] = left;
    positions[leftValue] = right;
    left += 1;
    right -= 1;
  }

  if (left === right) {
    positions[path[left]!] = left;
  }
}

function applyBackbite(
  path: number[],
  positions: number[],
  neighbors: readonly number[][],
  rng: ReturnType<typeof createRng>
): void {
  const last = path.length - 1;
  if (last < 2) {
    return;
  }

  const useFront = rng.next() < 0.5;

  if (useFront) {
    const endpoint = path[0]!;
    const blockedNeighbor = path[1]!;
    const candidatePositions = neighbors[endpoint]!
      .filter((neighbor) => neighbor !== blockedNeighbor)
      .map((neighbor) => positions[neighbor]!)
      .filter((position) => position > 1);

    if (candidatePositions.length === 0) {
      return;
    }

    reverseRange(path, positions, 0, rng.pick(candidatePositions) - 1);
    return;
  }

  const endpoint = path[last]!;
  const blockedNeighbor = path[last - 1]!;
  const candidatePositions = neighbors[endpoint]!
    .filter((neighbor) => neighbor !== blockedNeighbor)
    .map((neighbor) => positions[neighbor]!)
    .filter((position) => position < last - 1);

  if (candidatePositions.length === 0) {
    return;
  }

  reverseRange(path, positions, rng.pick(candidatePositions) + 1, last);
}

function fitGrid(
  bounds: Bounds,
  rows: number,
  cols: number
): Readonly<{
  gridBounds: Bounds;
  cellSize: number;
}> | null {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const cellSize = Math.min(width / cols, height / rows);

  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    return null;
  }

  const gridWidth = cellSize * cols;
  const gridHeight = cellSize * rows;
  const minX = bounds.minX + (width - gridWidth) * 0.5;
  const minY = bounds.minY + (height - gridHeight) * 0.5;

  return {
    gridBounds: {
      minX,
      minY,
      maxX: minX + gridWidth,
      maxY: minY + gridHeight,
    },
    cellSize,
  };
}

function cellPoint(index: number, cols: number, gridBounds: Bounds, cellSize: number): Point {
  const row = Math.floor(index / cols);
  const col = index % cols;

  return {
    x: gridBounds.minX + (col + 0.5) * cellSize,
    y: gridBounds.minY + (row + 0.5) * cellSize,
  };
}

function toPolyline(
  path: readonly number[],
  cols: number,
  gridBounds: Bounds,
  cellSize: number
): Polyline {
  return {
    points: path.map((index) => cellPoint(index, cols, gridBounds, cellSize)),
  };
}

export function generateHamiltonPaths(
  bounds: Bounds,
  options: HamiltonPathOptions
): HamiltonPathResult {
  const normalized = normalizeOptions(options);
  const offsets = parallelStrokeOffsets(
    normalized.strokeCount,
    normalized.strokeSpacing,
    normalized.drawCenterlines
  );
  const maxOffset = offsets.reduce(
    (maximum, offset) => Math.max(maximum, Math.abs(offset)),
    0
  );
  const insetBounds = expandBounds(bounds, -(maxOffset + normalized.deflection));

  if (
    insetBounds.minX >= insetBounds.maxX ||
    insetBounds.minY >= insetBounds.maxY
  ) {
    return emptyResult(bounds, normalized);
  }

  const fit = fitGrid(insetBounds, normalized.rows, normalized.cols);
  if (!fit) {
    return emptyResult(bounds, normalized);
  }

  const path = snakeHamiltonPath(normalized.rows, normalized.cols);
  const positions = Array.from({ length: path.length }, () => 0);
  path.forEach((cell, index) => {
    positions[cell] = index;
  });

  const neighbors = buildNeighborTable(normalized.rows, normalized.cols);
  const rng = createRng(normalized.seed);

  for (let step = 0; step < normalized.mixSteps; step += 1) {
    applyBackbite(path, positions, neighbors, rng);
  }

  const centerline = toPolyline(path, normalized.cols, fit.gridBounds, fit.cellSize);
  const paths = offsets.map((offset) =>
    roundPolylineCorners(
      buildLanePolyline(centerline, offset, normalized.deflection),
      normalized.cornerRadius,
      offset
    )
  );

  return {
    centerline,
    paths,
    rows: normalized.rows,
    cols: normalized.cols,
    cellSize: fit.cellSize,
    gridBounds: fit.gridBounds,
  };
}
