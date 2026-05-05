import {
  clamp,
  contentBounds,
  defineProgram,
  floatParam,
  intParam,
  lazyEditor,
  sampleEpitrochoid,
  sampleFunctionPath,
  sampleHypotrochoid,
  type NormalizedParams,
  type Point,
  type Polyline,
  type ProgramRenderContext,
} from "@ligneclaire/sdk";
import { boolParam } from "@ligneclaire/sdk";

export const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const trochoidParamSchema = {
  useEpitrochoid: boolParam({
    default: false,
    label: "Use Epitrochoid",
    group: "Figure",
  }),
  fixedRadius: intParam({
    min: 16,
    max: 144,
    default: 84,
    label: "Fixed Radius",
    group: "Gear",
  }),
  rollingRadius: intParam({
    min: 3,
    max: 72,
    default: 30,
    label: "Rolling Radius",
    group: "Gear",
  }),
  pointOffsetRatio: floatParam({
    min: 0,
    max: 2,
    default: 0.82,
    step: 0.01,
    label: "Pen Offset",
    group: "Gear",
  }),
  figureRadius: floatParam({
    min: 12,
    max: 110,
    default: 68,
    step: 0.5,
    label: "Figure Radius",
    group: "Placement",
    unit: "mm",
  }),
  rotationDeg: floatParam({
    min: 0,
    max: 360,
    default: 0,
    step: 1,
    label: "Rotation",
    group: "Placement",
    unit: "deg",
  }),
  samplesPerTurn: intParam({
    min: 64,
    max: 720,
    default: 320,
    label: "Samples Per Turn",
    group: "Quality",
  }),
} as const;

export type TrochoidSchema = typeof trochoidParamSchema;
type TrochoidParams = NormalizedParams<TrochoidSchema>;

export type TrochoidProgramState = Readonly<{
  center: Point;
}>;

type TrochoidRenderContext = ProgramRenderContext<TrochoidSchema, TrochoidProgramState>;

const defaultProgramState = (): TrochoidProgramState => ({
  center: {
    x: canvas.widthMm * 0.5,
    y: canvas.heightMm * 0.5,
  },
});

function normalizeProgramState(input: unknown): TrochoidProgramState {
  const fallback = defaultProgramState();
  const bounds = contentBounds(canvas);

  if (!input || typeof input !== "object") {
    return fallback;
  }

  const candidate = input as Record<string, unknown>;
  const centerCandidate =
    candidate.center && typeof candidate.center === "object"
      ? (candidate.center as Record<string, unknown>)
      : null;

  const centerX =
    typeof centerCandidate?.x === "number" && Number.isFinite(centerCandidate.x)
      ? clamp(centerCandidate.x, bounds.minX, bounds.maxX)
      : fallback.center.x;
  const centerY =
    typeof centerCandidate?.y === "number" && Number.isFinite(centerCandidate.y)
      ? clamp(centerCandidate.y, bounds.minY, bounds.maxY)
      : fallback.center.y;

  return {
    center: {
      x: centerX,
      y: centerY,
    },
  };
}

function resolveRollingRadius(params: TrochoidParams): number {
  if (params.useEpitrochoid) {
    return params.rollingRadius;
  }

  return clamp(params.rollingRadius, 1, Math.max(1, params.fixedRadius - 1));
}

function maxDistanceFromOrigin(polyline: Polyline): number {
  let maxDistance = 0;

  for (const point of polyline.points) {
    maxDistance = Math.max(maxDistance, Math.hypot(point.x, point.y));
  }

  return Math.max(1e-6, maxDistance);
}

function availableFigureRadius(center: Point): number {
  const bounds = contentBounds(canvas);

  return Math.max(
    4,
    Math.min(
      center.x - bounds.minX,
      bounds.maxX - center.x,
      center.y - bounds.minY,
      bounds.maxY - center.y
    )
  );
}

function placePolyline(polyline: Polyline, center: Point, radius: number): Polyline {
  const scale = radius / maxDistanceFromOrigin(polyline);

  return {
    points: polyline.points.map((point) => ({
      x: center.x + point.x * scale,
      y: center.y + point.y * scale,
    })),
  };
}

function makeGuideCircle(center: Point, radius: number, segments = 72): Polyline {
  return sampleFunctionPath(
    (t) => {
      const angle = t * Math.PI * 2;
      return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
    },
    0,
    1,
    segments
  );
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

function buildTrochoidPath(params: TrochoidParams, programState: TrochoidProgramState): Polyline {
  const rollingRadius = resolveRollingRadius(params);
  const rawPath = params.useEpitrochoid
    ? sampleEpitrochoid({
        fixedRadius: params.fixedRadius,
        rollingRadius,
        pointOffset: rollingRadius * params.pointOffsetRatio,
        rotation: (params.rotationDeg / 180) * Math.PI,
        samplesPerTurn: params.samplesPerTurn,
      })
    : sampleHypotrochoid({
        fixedRadius: params.fixedRadius,
        rollingRadius,
        pointOffset: rollingRadius * params.pointOffsetRatio,
        rotation: (params.rotationDeg / 180) * Math.PI,
        samplesPerTurn: params.samplesPerTurn,
      });

  const targetRadius = Math.min(params.figureRadius, availableFigureRadius(programState.center));
  return placePolyline(rawPath, programState.center, targetRadius);
}

export const program = defineProgram({
  id: "trochoid",
  title: "Trochoid Figure",
  description: "Place a hypotrochoid or epitrochoid figure on the sheet and tune its gear geometry.",
  version: "1.0.0",
  canvas,
  params: trochoidParamSchema,
  defaultProgramState,
  normalizeProgramState,
  validation: {
    cases: ["default"],
    budgets: {
      maxRenderMs: 200,
      maxArtLayers: 1,
      maxPaths: 1,
      maxSegments: 60000,
      maxDrawDistanceMm: 300000,
      maxPenUpDistanceMm: 10,
    },
  },
  editor: lazyEditor(() => import("./editor")),
  render(ctx: TrochoidRenderContext) {
    const path = buildTrochoidPath(ctx.params, ctx.programState);
    const guideRadius = Math.min(
      ctx.params.figureRadius,
      availableFigureRadius(ctx.programState.center)
    );

    return {
      canvas,
      layers: [
        {
          id: "trochoid-figure",
          label: "Trochoid Figure",
          stroke: "#0f172a",
          paths: [path],
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "trochoid-guide",
              label: "Trochoid Guide",
              stroke: "#dc2626",
              paths: [
                ...makeCrosshair(ctx.programState.center, 8),
                makeGuideCircle(ctx.programState.center, guideRadius),
              ],
            },
          ]
        : undefined,
      metadata: {
        programId: "trochoid",
        version: "1.0.0",
        mode: ctx.mode,
        figureType: ctx.params.useEpitrochoid ? "epitrochoid" : "hypotrochoid",
      },
    };
  },
});
