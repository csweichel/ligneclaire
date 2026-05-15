import {
  contentBounds,
  defineProgram,
  floatParam,
  intParam,
  lazyEditor,
  plotPalette,
  sampleFunctionPath,
  type Bounds,
  type NormalizedParams,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 12,
} as const;

const DEFAULT_SOURCE_NAME = "default-heart.svg";
const EPSILON = 1e-6;

export const svgConcentricOutlineParamSchema = {
  copies: intParam({
    min: 2,
    max: 160,
    default: 36,
    label: "Copies",
    group: "Structure",
  }),
  shrinkFactor: floatParam({
    min: 0.4,
    max: 1,
    default: 0.94,
    step: 0.01,
    label: "Shrink Factor",
    group: "Scale",
  }),
  shrinkStepMm: floatParam({
    min: 0,
    max: 40,
    default: 0,
    step: 0.25,
    label: "Shrink Step",
    group: "Scale",
    unit: "mm",
  }),
  sizeMm: floatParam({
    min: 24,
    max: 220,
    default: 150,
    step: 1,
    label: "Size",
    group: "Scale",
    unit: "mm",
  }),
} as const;

export type SvgConcentricOutlineSchema = typeof svgConcentricOutlineParamSchema;
export type SvgConcentricOutlineParams = NormalizedParams<SvgConcentricOutlineSchema>;

export type SvgOutlinePath = Readonly<{
  closed: boolean;
  points: readonly Point[];
}>;

export type SvgConcentricOutlineProgramState = Readonly<{
  sourceName: string;
  paths: readonly SvgOutlinePath[];
}>;

function distanceBetweenPoints(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function clonePath(path: SvgOutlinePath): SvgOutlinePath {
  return {
    closed: path.closed,
    points: path.points.map((point) => ({
      x: point.x,
      y: point.y,
    })),
  };
}

function dedupePoints(points: readonly Point[]): Point[] {
  const deduped: Point[] = [];

  for (const point of points) {
    if (
      deduped.length > 0 &&
      distanceBetweenPoints(deduped.at(-1)!, point) <= EPSILON
    ) {
      continue;
    }

    deduped.push({
      x: point.x,
      y: point.y,
    });
  }

  return deduped;
}

function sanitizePath(input: unknown): SvgOutlinePath | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const pointsValue = Array.isArray(candidate.points) ? candidate.points : [];
  const points = dedupePoints(
    pointsValue.flatMap((value) => {
      if (!value || typeof value !== "object") {
        return [];
      }

      const point = value as Record<string, unknown>;
      if (
        typeof point.x !== "number" ||
        !Number.isFinite(point.x) ||
        typeof point.y !== "number" ||
        !Number.isFinite(point.y)
      ) {
        return [];
      }

      return [
        {
          x: point.x,
          y: point.y,
        },
      ];
    })
  );
  const closed = candidate.closed === true;

  if (
    closed &&
    points.length > 2 &&
    distanceBetweenPoints(points[0]!, points.at(-1)!) <= EPSILON
  ) {
    points.pop();
  }

  if (points.length < (closed ? 3 : 2)) {
    return null;
  }

  return {
    closed,
    points,
  };
}

function buildDefaultOutlinePath(): SvgOutlinePath {
  const sampled = sampleFunctionPath(
    (t) => {
      const angle = t * Math.PI * 2;
      return {
        x: 72 * Math.sin(angle) ** 3,
        y:
          -5.4 *
          (13 * Math.cos(angle) -
            5 * Math.cos(angle * 2) -
            2 * Math.cos(angle * 3) -
            Math.cos(angle * 4)),
      };
    },
    0,
    1,
    144
  );

  return {
    closed: true,
    points: sampled.points.slice(0, -1),
  };
}

const defaultPaths = [buildDefaultOutlinePath()] as const;

export function defaultSvgConcentricOutlineProgramState(): SvgConcentricOutlineProgramState {
  return {
    sourceName: DEFAULT_SOURCE_NAME,
    paths: defaultPaths.map(clonePath),
  };
}

export function normalizeSvgConcentricOutlineProgramState(
  input: unknown
): SvgConcentricOutlineProgramState {
  if (!input || typeof input !== "object") {
    return defaultSvgConcentricOutlineProgramState();
  }

  const candidate = input as Record<string, unknown>;
  const pathsValue = Array.isArray(candidate.paths) ? candidate.paths : [];
  const paths = pathsValue.flatMap((value) => {
    const sanitized = sanitizePath(value);
    return sanitized ? [sanitized] : [];
  });
  const sourceName =
    typeof candidate.sourceName === "string" && candidate.sourceName.trim().length > 0
      ? candidate.sourceName.trim()
      : paths.length > 0
        ? "imported-outline.svg"
        : "";

  return {
    sourceName,
    paths,
  };
}

export function countSvgOutlinePoints(
  state: SvgConcentricOutlineProgramState
): number {
  return state.paths.reduce((total, path) => total + path.points.length, 0);
}

export function svgOutlineBounds(
  paths: readonly SvgOutlinePath[]
): Bounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const path of paths) {
    for (const point of path.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
  };
}

function boundsCenter(bounds: Bounds): Point {
  return {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };
}

function polygonCentroid(path: SvgOutlinePath): Readonly<{
  area: number;
  centroid: Point;
}> | null {
  if (!path.closed || path.points.length < 3) {
    return null;
  }

  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < path.points.length; index += 1) {
    const current = path.points[index]!;
    const next = path.points[(index + 1) % path.points.length]!;
    const cross = current.x * next.y - next.x * current.y;
    twiceArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  if (Math.abs(twiceArea) <= EPSILON) {
    return null;
  }

  return {
    area: Math.abs(twiceArea * 0.5),
    centroid: {
      x: centroidX / (3 * twiceArea),
      y: centroidY / (3 * twiceArea),
    },
  };
}

export function svgOutlineCentroid(paths: readonly SvgOutlinePath[]): Point | null {
  let weightedArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (const path of paths) {
    const polygon = polygonCentroid(path);
    if (!polygon) {
      continue;
    }

    weightedArea += polygon.area;
    centroidX += polygon.centroid.x * polygon.area;
    centroidY += polygon.centroid.y * polygon.area;
  }

  if (weightedArea > EPSILON) {
    return {
      x: centroidX / weightedArea,
      y: centroidY / weightedArea,
    };
  }

  const bounds = svgOutlineBounds(paths);
  if (!bounds) {
    return null;
  }

  let pointCount = 0;
  let fallbackX = 0;
  let fallbackY = 0;

  for (const path of paths) {
    for (const point of path.points) {
      pointCount += 1;
      fallbackX += point.x;
      fallbackY += point.y;
    }
  }

  if (pointCount > 0) {
    return {
      x: fallbackX / pointCount,
      y: fallbackY / pointCount,
    };
  }

  return boundsCenter(bounds);
}

function makeCrosshair(center: Point, size: number): readonly Polyline[] {
  return [
    {
      points: [
        { x: center.x - size, y: center.y },
        { x: center.x + size, y: center.y },
      ],
    },
    {
      points: [
        { x: center.x, y: center.y - size },
        { x: center.x, y: center.y + size },
      ],
    },
  ];
}

export function buildSvgConcentricPaths(
  params: SvgConcentricOutlineParams,
  state: SvgConcentricOutlineProgramState,
  targetBounds: Bounds
): readonly Polyline[] {
  const sourceBounds = svgOutlineBounds(state.paths);
  const sourceCentroid = svgOutlineCentroid(state.paths);
  if (!sourceBounds || !sourceCentroid) {
    return [];
  }

  const sourceWidth = Math.max(EPSILON, sourceBounds.maxX - sourceBounds.minX);
  const sourceHeight = Math.max(EPSILON, sourceBounds.maxY - sourceBounds.minY);
  const targetCenter = boundsCenter(targetBounds);
  const targetMaxDimension = Math.min(
    params.sizeMm,
    targetBounds.maxX - targetBounds.minX,
    targetBounds.maxY - targetBounds.minY
  );
  if (targetMaxDimension <= EPSILON) {
    return [];
  }

  const baseScale = targetMaxDimension / Math.max(sourceWidth, sourceHeight);
  const positionedPaths = state.paths.map((sourcePath) => ({
    closed: sourcePath.closed,
    points: sourcePath.points.map((point) => ({
      x: targetCenter.x + (point.x - sourceCentroid.x) * baseScale,
      y: targetCenter.y + (point.y - sourceCentroid.y) * baseScale,
    })),
  }));
  const pathAnchors = positionedPaths.map((path) => {
    const bounds = svgOutlineBounds([path]);
    if (!bounds) {
      return targetCenter;
    }

    return svgOutlineCentroid([path]) ?? boundsCenter(bounds);
  });
  const paths: Polyline[] = [];

  for (let copyIndex = 0; copyIndex < params.copies; copyIndex += 1) {
    const copyMaxDimension =
      targetMaxDimension * params.shrinkFactor ** copyIndex -
      params.shrinkStepMm * copyIndex;

    if (copyMaxDimension <= EPSILON) {
      break;
    }

    const copyScale = copyMaxDimension / targetMaxDimension;

    for (const [pathIndex, sourcePath] of positionedPaths.entries()) {
      const anchor = pathAnchors[pathIndex]!;
      const points = sourcePath.points.map((point) => ({
        x: anchor.x + (point.x - anchor.x) * copyScale,
        y: anchor.y + (point.y - anchor.y) * copyScale,
      }));

      if (points.length < (sourcePath.closed ? 3 : 2)) {
        continue;
      }

      paths.push({
        closed: sourcePath.closed,
        points,
      });
    }
  }

  return paths;
}

export const program = defineProgram({
  id: "svg-concentric-outline",
  title: "SVG Concentric Outline",
  description: "Import an SVG outline and repeatedly scale it toward its centroid to create concentric draw paths.",
  version: "1.0.0",
  canvas,
  params: svgConcentricOutlineParamSchema,
  defaultProgramState: defaultSvgConcentricOutlineProgramState,
  normalizeProgramState: normalizeSvgConcentricOutlineProgramState,
  validation: {
    cases: ["default"],
    budgets: {
      maxRenderMs: 150,
      maxArtLayers: 1,
      maxPaths: 200,
      maxSegments: 25000,
      maxDrawDistanceMm: 120000,
      maxPenUpDistanceMm: 10000,
    },
  },
  editor: lazyEditor(() => import("./editor")),
  render(ctx) {
    const bounds = contentBounds(canvas);
    const paths = buildSvgConcentricPaths(ctx.params, ctx.programState, bounds);
    const center = boundsCenter(bounds);

    return {
      canvas,
      layers: [
        {
          id: "svg-concentric-outline",
          label: "SVG Concentric Outline",
          stroke: plotPalette.primary,
          paths,
        },
      ],
      debugLayers:
        ctx.showDebug && paths.length > 0
          ? [
              {
                id: "svg-centroid",
                label: "SVG Centroid",
                stroke: plotPalette.mask,
                paths: makeCrosshair(center, 4),
              },
            ]
          : undefined,
      metadata: {
        programId: "svg-concentric-outline",
        version: "1.0.0",
        mode: ctx.mode,
        sourceName: ctx.programState.sourceName,
      },
    };
  },
});
