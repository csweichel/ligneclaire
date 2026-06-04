import {
  contentBounds,
  defineProgram,
  drawGrayscaleImageGrid,
  floatParam,
  intParam,
  lazyEditor,
  plotPalette,
  type Bounds,
  type NormalizedParams,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const imageLineDrawingParamSchema = {
  maxImageDimension: intParam({
    min: 32,
    max: 192,
    default: 128,
    label: "Import Resolution",
    group: "Image",
  }),
  levels: intParam({
    min: 1,
    max: 8,
    default: 4,
    label: "Contour Levels",
    group: "Trace",
  }),
  darknessFloor: floatParam({
    min: 0.05,
    max: 0.9,
    default: 0.18,
    step: 0.01,
    label: "Darkness Floor",
    group: "Trace",
  }),
  contrast: floatParam({
    min: 0.5,
    max: 2.5,
    default: 1.15,
    step: 0.05,
    label: "Contrast",
    group: "Trace",
  }),
  simplifyMm: floatParam({
    min: 0,
    max: 2,
    default: 0.25,
    step: 0.05,
    label: "Simplify",
    group: "Line",
    unit: "mm",
  }),
  minSegmentMm: floatParam({
    min: 0.1,
    max: 8,
    default: 1.2,
    step: 0.1,
    label: "Minimum Segment",
    group: "Line",
    unit: "mm",
  }),
} as const;

export type ImageLineDrawingSchema = typeof imageLineDrawingParamSchema;
export type ImageLineDrawingParams = NormalizedParams<ImageLineDrawingSchema>;

export type ImageLineDrawingImage = Readonly<{
  columns: number;
  rows: number;
  valuesBase64: string;
  hash: string;
}>;

export type ImageLineDrawingCache = Readonly<{
  key: string;
  path: Polyline;
}>;

export type ImageLineDrawingProgramState = Readonly<{
  sourceName: string;
  image: ImageLineDrawingImage | null;
  cache: ImageLineDrawingCache | null;
}>;

type ImageGrid = Readonly<{
  columns: number;
  rows: number;
  values: readonly number[];
}>;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function decodeBase64Bytes(encoded: string): number[] {
  const binary = globalThis.atob(encoded);
  return Array.from(binary, (char) => char.charCodeAt(0));
}

export function encodeGrayscaleBytes(values: readonly number[]): string {
  let binary = "";
  for (const value of values) {
    binary += String.fromCharCode(clampByte(value));
  }
  return globalThis.btoa(binary);
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function imageHash(columns: number, rows: number, valuesBase64: string): string {
  return hashString(`${columns}x${rows}:${valuesBase64}`);
}

function decodeImage(image: ImageLineDrawingImage): ImageGrid {
  const values = decodeBase64Bytes(image.valuesBase64);
  if (values.length !== image.columns * image.rows) {
    return fallbackImageGrid();
  }
  return {
    columns: image.columns,
    rows: image.rows,
    values,
  };
}

function valueAt(grid: ImageGrid, column: number, row: number): number {
  const clampedColumn = Math.max(0, Math.min(grid.columns - 1, column));
  const clampedRow = Math.max(0, Math.min(grid.rows - 1, row));
  return grid.values[clampedRow * grid.columns + clampedColumn] ?? 255;
}

function fallbackImageGrid(): ImageGrid {
  const columns = 48;
  const rows = 64;
  const values: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column + 0.5) / columns - 0.5;
      const y = (row + 0.5) / rows - 0.5;
      const head = Math.hypot(x / 0.28, (y + 0.02) / 0.36);
      const shoulder = Math.hypot(x / 0.42, (y - 0.35) / 0.18);
      const eyeBand = Math.exp(-Math.pow((y + 0.08) / 0.035, 2));
      const mouthBand = Math.exp(-Math.pow((y - 0.17) / 0.035, 2));
      const facialDarkness =
        Math.max(0, 1 - head) * 0.75 +
        Math.max(0, 1 - shoulder) * 0.3 +
        eyeBand * (Math.abs(x) > 0.08 && Math.abs(x) < 0.2 ? 0.45 : 0) +
        mouthBand * (Math.abs(x) < 0.16 ? 0.25 : 0);
      values.push(clampByte(255 - facialDarkness * 255));
    }
  }

  return {
    columns,
    rows,
    values,
  };
}

function defaultImage(): ImageLineDrawingImage {
  const grid = fallbackImageGrid();
  const valuesBase64 = encodeGrayscaleBytes(grid.values);
  return {
    columns: grid.columns,
    rows: grid.rows,
    valuesBase64,
    hash: imageHash(grid.columns, grid.rows, valuesBase64),
  };
}

export function defaultImageLineDrawingProgramState(): ImageLineDrawingProgramState {
  return {
    sourceName: "Reference portrait",
    image: defaultImage(),
    cache: null,
  };
}

function pointKey(point: Point): string {
  return `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
}

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function darknessAt(grid: ImageGrid, column: number, row: number, contrast: number): number {
  const luminosity = valueAt(grid, column, row) / 255;
  const darkness = 1 - luminosity;
  return Math.max(0, Math.min(1, Math.pow(darkness, 1 / contrast)));
}

function cellPoint(bounds: Bounds, grid: ImageGrid, column: number, row: number): Point {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return {
    x: bounds.minX + (column / Math.max(1, grid.columns - 1)) * width,
    y: bounds.maxY - (row / Math.max(1, grid.rows - 1)) * height,
  };
}

type Segment = Readonly<{
  start: Point;
  end: Point;
}>;

function contourSegmentsForCell(
  grid: ImageGrid,
  bounds: Bounds,
  column: number,
  row: number,
  level: number,
  contrast: number
): Segment[] {
  const values = [
    darknessAt(grid, column, row, contrast),
    darknessAt(grid, column + 1, row, contrast),
    darknessAt(grid, column + 1, row + 1, contrast),
    darknessAt(grid, column, row + 1, contrast),
  ];
  const points = [
    cellPoint(bounds, grid, column, row),
    cellPoint(bounds, grid, column + 1, row),
    cellPoint(bounds, grid, column + 1, row + 1),
    cellPoint(bounds, grid, column, row + 1),
  ];
  const crossings: Point[] = [];

  for (const [leftIndex, rightIndex] of [
    [0, 1],
    [1, 2],
    [3, 2],
    [0, 3],
  ] as const) {
    const leftValue = values[leftIndex]!;
    const rightValue = values[rightIndex]!;
    if ((leftValue >= level) === (rightValue >= level)) {
      continue;
    }

    const denominator = rightValue - leftValue;
    const rawAmount =
      Math.abs(denominator) <= 1e-6 ? 0.5 : (level - leftValue) / denominator;
    const amount = Math.max(0, Math.min(1, rawAmount));
    const leftPoint = points[leftIndex]!;
    const rightPoint = points[rightIndex]!;
    crossings.push({
      x: lerp(leftPoint.x, rightPoint.x, amount),
      y: lerp(leftPoint.y, rightPoint.y, amount),
    });
  }

  if (crossings.length === 2) {
    return [{ start: crossings[0]!, end: crossings[1]! }];
  }
  if (crossings.length === 4) {
    return [
      { start: crossings[0]!, end: crossings[1]! },
      { start: crossings[2]!, end: crossings[3]! },
    ];
  }
  return [];
}

function stitchSegments(segments: readonly Segment[]): Polyline[] {
  const remaining = segments.map((segment) => ({ ...segment }));
  const paths: Polyline[] = [];

  while (remaining.length > 0) {
    const first = remaining.pop()!;
    const points: Point[] = [first.start, first.end];
    let changed = true;

    while (changed) {
      changed = false;
      const startKey = pointKey(points[0]!);
      const endKey = pointKey(points[points.length - 1]!);

      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const segment = remaining[index]!;
        const segmentStartKey = pointKey(segment.start);
        const segmentEndKey = pointKey(segment.end);

        if (segmentStartKey === endKey) {
          points.push(segment.end);
        } else if (segmentEndKey === endKey) {
          points.push(segment.start);
        } else if (segmentEndKey === startKey) {
          points.unshift(segment.start);
        } else if (segmentStartKey === startKey) {
          points.unshift(segment.end);
        } else {
          continue;
        }

        remaining.splice(index, 1);
        changed = true;
        break;
      }
    }

    if (points.length > 1) {
      paths.push({ points });
    }
  }

  return paths;
}

function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1]!, points[index]!);
  }
  return total;
}

function perpendicularDistance(point: Point, start: Point, end: Point): number {
  const lineLength = distance(start, end);
  if (lineLength <= 1e-6) {
    return distance(point, start);
  }
  const amount =
    ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) /
    (lineLength * lineLength);
  const projected = {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  };
  return distance(point, projected);
}

function simplifyPoints(points: readonly Point[], tolerance: number): readonly Point[] {
  if (points.length <= 2 || tolerance <= 0) {
    return points;
  }

  let maxDistance = 0;
  let splitIndex = 0;
  const start = points[0]!;
  const end = points[points.length - 1]!;

  for (let index = 1; index < points.length - 1; index += 1) {
    const candidateDistance = perpendicularDistance(points[index]!, start, end);
    if (candidateDistance > maxDistance) {
      maxDistance = candidateDistance;
      splitIndex = index;
    }
  }

  if (maxDistance <= tolerance) {
    return [start, end];
  }

  const left = simplifyPoints(points.slice(0, splitIndex + 1), tolerance);
  const right = simplifyPoints(points.slice(splitIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function joinIntoSinglePath(paths: readonly Polyline[]): Polyline {
  const remaining = paths
    .map((path) => [...path.points])
    .filter((points) => points.length > 1)
    .sort((left, right) => pathLength(right) - pathLength(left));
  const points = remaining.shift() ?? [];

  while (remaining.length > 0 && points.length > 0) {
    const tail = points[points.length - 1]!;
    let bestIndex = 0;
    let reverse = false;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      const startDistance = distance(tail, candidate[0]!);
      const endDistance = distance(tail, candidate[candidate.length - 1]!);

      if (startDistance < bestDistance) {
        bestDistance = startDistance;
        bestIndex = index;
        reverse = false;
      }
      if (endDistance < bestDistance) {
        bestDistance = endDistance;
        bestIndex = index;
        reverse = true;
      }
    }

    const [next] = remaining.splice(bestIndex, 1);
    points.push(...(reverse ? [...next!].reverse() : next!));
  }

  return { points };
}

export function imageLineDrawingCacheKey(
  image: ImageLineDrawingImage,
  params: ImageLineDrawingParams
): string {
  return hashString(
    JSON.stringify({
      image: image.hash,
      levels: params.levels,
      darknessFloor: params.darknessFloor,
      contrast: params.contrast,
      simplifyMm: params.simplifyMm,
      minSegmentMm: params.minSegmentMm,
    })
  );
}

export function buildImageLineDrawingCache(
  image: ImageLineDrawingImage,
  params: ImageLineDrawingParams
): ImageLineDrawingCache {
  const bounds = contentBounds(canvas);
  const grid = decodeImage(image);
  const segments: Segment[] = [];

  for (let levelIndex = 0; levelIndex < params.levels; levelIndex += 1) {
    const amount = params.levels === 1 ? 0.5 : levelIndex / (params.levels - 1);
    const level = params.darknessFloor + amount * (1 - params.darknessFloor);

    for (let row = 0; row < grid.rows - 1; row += 1) {
      for (let column = 0; column < grid.columns - 1; column += 1) {
        segments.push(
          ...contourSegmentsForCell(grid, bounds, column, row, level, params.contrast)
        );
      }
    }
  }

  const paths = stitchSegments(segments)
    .filter((path) => pathLength(path.points) >= params.minSegmentMm)
    .map((path) => ({
      points: simplifyPoints(path.points, params.simplifyMm),
    }))
    .filter((path) => path.points.length > 1);

  return {
    key: imageLineDrawingCacheKey(image, params),
    path: joinIntoSinglePath(paths),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeImage(input: unknown): ImageLineDrawingImage | null {
  if (!isRecord(input)) {
    return null;
  }
  const columns = Math.floor(Number(input.columns));
  const rows = Math.floor(Number(input.rows));
  const valuesBase64 = typeof input.valuesBase64 === "string" ? input.valuesBase64 : "";
  if (columns < 2 || rows < 2 || valuesBase64.length === 0) {
    return null;
  }
  const hash =
    typeof input.hash === "string" && input.hash.length > 0
      ? input.hash
      : imageHash(columns, rows, valuesBase64);
  return {
    columns,
    rows,
    valuesBase64,
    hash,
  };
}

function normalizeCache(input: unknown): ImageLineDrawingCache | null {
  if (!isRecord(input) || typeof input.key !== "string" || !isRecord(input.path)) {
    return null;
  }
  const points = Array.isArray(input.path.points)
    ? input.path.points
        .filter(isRecord)
        .map((point) => ({
          x: Number(point.x),
          y: Number(point.y),
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  if (points.length < 2) {
    return null;
  }
  return {
    key: input.key,
    path: { points },
  };
}

function normalizeProgramState(
  input: unknown,
  params: ImageLineDrawingParams
): ImageLineDrawingProgramState {
  const record = isRecord(input) ? input : {};
  const image = normalizeImage(record.image) ?? defaultImage();
  const sourceName =
    typeof record.sourceName === "string" && record.sourceName.trim().length > 0
      ? record.sourceName.trim()
      : "Reference portrait";
  const cache = normalizeCache(record.cache);
  const expectedKey = imageLineDrawingCacheKey(image, params);

  return {
    sourceName,
    image,
    cache: cache?.key === expectedKey ? cache : null,
  };
}

function debugImagePaths(image: ImageLineDrawingImage): readonly Polyline[] {
  return drawGrayscaleImageGrid(decodeImage(image), contentBounds(canvas), {
    maxLinesPerCell: 4,
  });
}

export const program = defineProgram({
  id: "image-line-drawing",
  title: "Image Line Drawing",
  description: "An image-to-single-line contour trace inspired by bio-glyph.",
  version: "1.0.0",
  canvas,
  params: imageLineDrawingParamSchema,
  defaultProgramState: defaultImageLineDrawingProgramState,
  normalizeProgramState(input, ctx) {
    return normalizeProgramState(input, ctx.params);
  },
  validation: {
    cases: ["default"],
  },
  editor: lazyEditor(() => import("./editor")),
  render(ctx) {
    const image = ctx.programState.image ?? defaultImage();
    const cache =
      ctx.programState.cache?.key === imageLineDrawingCacheKey(image, ctx.params)
        ? ctx.programState.cache
        : buildImageLineDrawingCache(image, ctx.params);

    return {
      canvas,
      layers: [
        {
          id: "image-line-drawing",
          label: "Image Line Drawing",
          stroke: plotPalette.primary,
          paths: cache.path.points.length > 1 ? [cache.path] : [],
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "image-line-source",
              label: "Image Source",
              stroke: plotPalette.mask,
              paths: debugImagePaths(image),
            },
          ]
        : undefined,
      metadata: {
        programId: "image-line-drawing",
        version: "1.0.0",
        mode: ctx.mode,
        sourceName: ctx.programState.sourceName,
        cache: ctx.programState.cache?.key === cache.key ? "hit" : "computed",
      },
    };
  },
});
