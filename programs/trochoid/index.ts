import {
  clamp,
  contentBounds,
  defineProgram,
  lazyEditor,
  sampleEpitrochoid,
  sampleFunctionPath,
  sampleHypotrochoid,
  type PersistedParamSet,
  type Point,
  type Polyline,
  type ProgramRenderContext,
} from "@ligneclaire/sdk";

export const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

const PROGRAM_VERSION = "1.1.0";
const MIN_FIXED_RADIUS = 16;
const MAX_FIXED_RADIUS = 144;
const MIN_ROLLING_RADIUS = 3;
const MAX_ROLLING_RADIUS = 72;
const MIN_POINT_OFFSET_RATIO = 0;
const MAX_POINT_OFFSET_RATIO = 2;
const MIN_FIGURE_RADIUS = 12;
const MIN_ROTATION_DEG = 0;
const MAX_ROTATION_DEG = 360;
const MIN_SAMPLES_PER_TURN = 64;
const MAX_SAMPLES_PER_TURN = 720;
const NEW_FIGURE_OFFSET_MM = 18;

export const MAX_TROCHOID_FIGURES = 24;
export const trochoidParamSchema = {} as const;

export type TrochoidSchema = typeof trochoidParamSchema;
export type TrochoidFigureConfig = Readonly<{
  useEpitrochoid: boolean;
  fixedRadius: number;
  rollingRadius: number;
  pointOffsetRatio: number;
  figureRadius: number;
  rotationDeg: number;
  samplesPerTurn: number;
}>;

export type TrochoidFigure = Readonly<{
  id: string;
  center: Point;
  config: TrochoidFigureConfig;
}>;

export type TrochoidProgramState = Readonly<{
  figures: readonly TrochoidFigure[];
  selectedFigureId: string | null;
  nextFigureNumber: number;
}>;

type TrochoidRenderContext = ProgramRenderContext<TrochoidSchema, TrochoidProgramState>;

export const defaultTrochoidFigureConfig: TrochoidFigureConfig = Object.freeze({
  useEpitrochoid: false,
  fixedRadius: 84,
  rollingRadius: 30,
  pointOffsetRatio: 0.82,
  figureRadius: 68,
  rotationDeg: 0,
  samplesPerTurn: 320,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readNumber(
  candidate: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = candidate[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sheetCenter(): Point {
  return {
    x: canvas.widthMm * 0.5,
    y: canvas.heightMm * 0.5,
  };
}

function figureId(number: number): string {
  return `figure-${number}`;
}

function maxSupportedFigureRadius(): number {
  const bounds = contentBounds(canvas);
  return Math.min(
    (bounds.maxX - bounds.minX) * 0.5,
    (bounds.maxY - bounds.minY) * 0.5
  );
}

export function normalizeTrochoidFigureConfig(
  input: unknown,
  fallback: TrochoidFigureConfig = defaultTrochoidFigureConfig
): TrochoidFigureConfig {
  const candidate = isRecord(input) ? input : {};
  const useEpitrochoid =
    typeof candidate.useEpitrochoid === "boolean"
      ? candidate.useEpitrochoid
      : fallback.useEpitrochoid;
  const fixedRadius = Math.round(
    clamp(readNumber(candidate, "fixedRadius", fallback.fixedRadius), MIN_FIXED_RADIUS, MAX_FIXED_RADIUS)
  );
  const maxRollingRadius = useEpitrochoid
    ? MAX_ROLLING_RADIUS
    : Math.max(MIN_ROLLING_RADIUS, Math.min(MAX_ROLLING_RADIUS, fixedRadius - 1));
  const rollingRadius = Math.round(
    clamp(
      readNumber(candidate, "rollingRadius", fallback.rollingRadius),
      MIN_ROLLING_RADIUS,
      maxRollingRadius
    )
  );
  const pointOffsetRatio = clamp(
    readNumber(candidate, "pointOffsetRatio", fallback.pointOffsetRatio),
    MIN_POINT_OFFSET_RATIO,
    MAX_POINT_OFFSET_RATIO
  );
  const figureRadius = clamp(
    readNumber(candidate, "figureRadius", fallback.figureRadius),
    MIN_FIGURE_RADIUS,
    maxSupportedFigureRadius()
  );
  const rotationDeg = clamp(
    readNumber(candidate, "rotationDeg", fallback.rotationDeg),
    MIN_ROTATION_DEG,
    MAX_ROTATION_DEG
  );
  const samplesPerTurn = Math.round(
    clamp(
      readNumber(candidate, "samplesPerTurn", fallback.samplesPerTurn),
      MIN_SAMPLES_PER_TURN,
      MAX_SAMPLES_PER_TURN
    )
  );

  return {
    useEpitrochoid,
    fixedRadius,
    rollingRadius,
    pointOffsetRatio,
    figureRadius,
    rotationDeg,
    samplesPerTurn,
  };
}

export function effectiveFigureRadius(config: TrochoidFigureConfig): number {
  return Math.min(config.figureRadius, maxSupportedFigureRadius());
}

export function clampTrochoidCenter(
  config: TrochoidFigureConfig,
  center: Point
): Point {
  const bounds = contentBounds(canvas);
  const radius = effectiveFigureRadius(config);
  const minX = bounds.minX + radius;
  const maxX = Math.max(minX, bounds.maxX - radius);
  const minY = bounds.minY + radius;
  const maxY = Math.max(minY, bounds.maxY - radius);

  return {
    x: clamp(center.x, minX, maxX),
    y: clamp(center.y, minY, maxY),
  };
}

function createTrochoidFigure(
  id: string,
  center: Point,
  configInput: unknown
): TrochoidFigure {
  const config = normalizeTrochoidFigureConfig(configInput);

  return {
    id,
    center: clampTrochoidCenter(config, center),
    config,
  };
}

const defaultProgramState = (): TrochoidProgramState => ({
  figures: [
    createTrochoidFigure(figureId(1), sheetCenter(), defaultTrochoidFigureConfig),
  ],
  selectedFigureId: figureId(1),
  nextFigureNumber: 2,
});

function normalizeFigureId(
  value: unknown,
  fallbackNumber: number,
  usedIds: Set<string>
): string {
  const fallbackId = figureId(fallbackNumber);
  const requested =
    typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value) ? value : fallbackId;
  let unique = requested;
  let suffix = 2;

  while (usedIds.has(unique)) {
    unique = `${requested}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(unique);
  return unique;
}

function deriveNextFigureNumber(figures: readonly TrochoidFigure[]): number {
  let highest = 0;

  for (const figure of figures) {
    const match = /^figure-(\d+)$/.exec(figure.id);
    if (!match) {
      continue;
    }

    highest = Math.max(highest, Number(match[1]));
  }

  return Math.max(highest + 1, figures.length + 1, 2);
}

export function selectedTrochoidFigure(
  programState: TrochoidProgramState
): TrochoidFigure | null {
  if (programState.selectedFigureId) {
    const selected = programState.figures.find(
      (figure) => figure.id === programState.selectedFigureId
    );
    if (selected) {
      return selected;
    }
  }

  return programState.figures[0] ?? null;
}

export function selectTrochoidFigure(
  programState: TrochoidProgramState,
  figureIdToSelect: string
): TrochoidProgramState {
  if (!programState.figures.some((figure) => figure.id === figureIdToSelect)) {
    return programState;
  }

  return {
    ...programState,
    selectedFigureId: figureIdToSelect,
  };
}

export function moveTrochoidFigure(
  programState: TrochoidProgramState,
  figureIdToMove: string,
  center: Point
): TrochoidProgramState {
  return {
    ...programState,
    figures: programState.figures.map((figure) =>
      figure.id === figureIdToMove
        ? {
            ...figure,
            center: clampTrochoidCenter(figure.config, center),
          }
        : figure
    ),
    selectedFigureId: figureIdToMove,
  };
}

export function patchTrochoidFigureConfig(
  programState: TrochoidProgramState,
  figureIdToPatch: string,
  patch: Partial<TrochoidFigureConfig>
): TrochoidProgramState {
  return {
    ...programState,
    figures: programState.figures.map((figure) => {
      if (figure.id !== figureIdToPatch) {
        return figure;
      }

      const config = normalizeTrochoidFigureConfig(
        {
          ...figure.config,
          ...patch,
        },
        figure.config
      );

      return {
        ...figure,
        config,
        center: clampTrochoidCenter(config, figure.center),
      };
    }),
    selectedFigureId: figureIdToPatch,
  };
}

export function addTrochoidFigure(
  programState: TrochoidProgramState
): TrochoidProgramState {
  if (programState.figures.length >= MAX_TROCHOID_FIGURES) {
    return programState;
  }

  const selected = selectedTrochoidFigure(programState);
  const nextId = figureId(programState.nextFigureNumber);
  const baseCenter = selected?.center ?? sheetCenter();
  const nextConfig = selected?.config ?? defaultTrochoidFigureConfig;
  const nextFigure = createTrochoidFigure(
    nextId,
    {
      x: baseCenter.x + NEW_FIGURE_OFFSET_MM,
      y: baseCenter.y - NEW_FIGURE_OFFSET_MM,
    },
    nextConfig
  );

  return {
    figures: [...programState.figures, nextFigure],
    selectedFigureId: nextFigure.id,
    nextFigureNumber: programState.nextFigureNumber + 1,
  };
}

export function removeTrochoidFigure(
  programState: TrochoidProgramState,
  figureIdToRemove: string
): TrochoidProgramState {
  const figures = programState.figures.filter(
    (figure) => figure.id !== figureIdToRemove
  );
  const selectedFigureId =
    programState.selectedFigureId === figureIdToRemove
      ? figures.at(-1)?.id ?? null
      : figures.some((figure) => figure.id === programState.selectedFigureId)
        ? programState.selectedFigureId
        : figures[0]?.id ?? null;

  return {
    ...programState,
    figures,
    selectedFigureId,
  };
}

function normalizedFiguresFromState(
  input: unknown,
  fallbackConfig: TrochoidFigureConfig = defaultTrochoidFigureConfig
): readonly TrochoidFigure[] {
  const fallback = defaultProgramState();
  if (!isRecord(input)) {
    return fallback.figures;
  }

  const usedIds = new Set<string>();
  const figureCandidates = Array.isArray(input.figures)
    ? input.figures
    : isRecord(input.center)
      ? [
          {
            id: figureId(1),
            center: input.center,
            config: input.config,
          },
        ]
      : fallback.figures;
  const figures = figureCandidates
    .slice(0, MAX_TROCHOID_FIGURES)
    .flatMap((value, index) => {
      if (!isRecord(value)) {
        return [];
      }

      const centerCandidate = isRecord(value.center) ? value.center : value;
      if (
        typeof centerCandidate.x !== "number" ||
        !Number.isFinite(centerCandidate.x) ||
        typeof centerCandidate.y !== "number" ||
        !Number.isFinite(centerCandidate.y)
      ) {
        return [];
      }

      return [
        createTrochoidFigure(
          normalizeFigureId(value.id, index + 1, usedIds),
          {
            x: centerCandidate.x,
            y: centerCandidate.y,
          },
          isRecord(value.config) ? value.config : fallbackConfig
        ),
      ];
    });

  return figures.length > 0 ? figures : fallback.figures;
}

function normalizeProgramState(input: unknown): TrochoidProgramState {
  const fallback = defaultProgramState();
  const candidate = isRecord(input) ? input : {};
  const figures = normalizedFiguresFromState(candidate);
  const selectedFigureId =
    typeof candidate.selectedFigureId === "string" &&
    figures.some((figure) => figure.id === candidate.selectedFigureId)
      ? candidate.selectedFigureId
      : figures[0]?.id ?? null;
  const nextFigureNumber =
    typeof candidate.nextFigureNumber === "number" &&
    Number.isFinite(candidate.nextFigureNumber)
      ? Math.max(Math.floor(candidate.nextFigureNumber), deriveNextFigureNumber(figures))
      : deriveNextFigureNumber(figures);

  return {
    figures,
    selectedFigureId,
    nextFigureNumber,
  };
}

function resolveRollingRadius(config: TrochoidFigureConfig): number {
  if (config.useEpitrochoid) {
    return config.rollingRadius;
  }

  return clamp(config.rollingRadius, 1, Math.max(1, config.fixedRadius - 1));
}

function maxDistanceFromOrigin(polyline: Polyline): number {
  let maxDistance = 0;

  for (const point of polyline.points) {
    maxDistance = Math.max(maxDistance, Math.hypot(point.x, point.y));
  }

  return Math.max(1e-6, maxDistance);
}

function placePolyline(
  polyline: Polyline,
  center: Point,
  radius: number
): Polyline {
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

function buildTrochoidTemplate(config: TrochoidFigureConfig): Polyline {
  const rollingRadius = resolveRollingRadius(config);

  if (config.useEpitrochoid) {
    return sampleEpitrochoid({
      fixedRadius: config.fixedRadius,
      rollingRadius,
      pointOffset: rollingRadius * config.pointOffsetRatio,
      rotation: (config.rotationDeg / 180) * Math.PI,
      samplesPerTurn: config.samplesPerTurn,
    });
  }

  return sampleHypotrochoid({
    fixedRadius: config.fixedRadius,
    rollingRadius,
    pointOffset: rollingRadius * config.pointOffsetRatio,
    rotation: (config.rotationDeg / 180) * Math.PI,
    samplesPerTurn: config.samplesPerTurn,
  });
}

function migrateParamSet(legacy: PersistedParamSet): PersistedParamSet {
  const legacyConfig = normalizeTrochoidFigureConfig(legacy.params);
  const candidateState = isRecord(legacy.programState) ? legacy.programState : {};
  const figures = normalizedFiguresFromState(candidateState, legacyConfig);
  const selectedFigureId =
    typeof candidateState.selectedFigureId === "string" &&
    figures.some((figure) => figure.id === candidateState.selectedFigureId)
      ? candidateState.selectedFigureId
      : figures[0]?.id ?? null;
  const nextFigureNumber =
    typeof candidateState.nextFigureNumber === "number" &&
    Number.isFinite(candidateState.nextFigureNumber)
      ? Math.max(
          Math.floor(candidateState.nextFigureNumber),
          deriveNextFigureNumber(figures)
        )
      : deriveNextFigureNumber(figures);

  return {
    ...legacy,
    programVersion: PROGRAM_VERSION,
    params: {},
    programState: {
      figures,
      selectedFigureId,
      nextFigureNumber,
    },
  };
}

export const program = defineProgram({
  id: "trochoid",
  title: "Trochoid Figure",
  description:
    "Place and independently tune multiple hypotrochoid or epitrochoid figures on the sheet.",
  version: PROGRAM_VERSION,
  canvas,
  params: trochoidParamSchema,
  defaultProgramState,
  normalizeProgramState,
  migrateParamSet,
  validation: {
    cases: ["default"],
    budgets: {
      maxRenderMs: 250,
      maxArtLayers: 1,
      maxPaths: MAX_TROCHOID_FIGURES,
      maxSegments: 60000,
      maxDrawDistanceMm: 300000,
      maxPenUpDistanceMm: 20000,
    },
  },
  editor: lazyEditor(() => import("./editor")),
  render(ctx: TrochoidRenderContext) {
    const paths = ctx.programState.figures.map((figure) =>
      placePolyline(
        buildTrochoidTemplate(figure.config),
        figure.center,
        effectiveFigureRadius(figure.config)
      )
    );
    const selected = selectedTrochoidFigure(ctx.programState);

    return {
      canvas,
      layers: [
        {
          id: "trochoid-figure",
          label: "Trochoid Figure",
          stroke: "#0f172a",
          paths,
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "trochoid-guide",
              label: "Trochoid Guide",
              stroke: "#dc2626",
              paths: [
                ...ctx.programState.figures.map((figure) =>
                  makeGuideCircle(figure.center, effectiveFigureRadius(figure.config))
                ),
                ...(selected ? makeCrosshair(selected.center, 8) : []),
              ],
            },
          ]
        : undefined,
      metadata: {
        programId: "trochoid",
        version: PROGRAM_VERSION,
        mode: ctx.mode,
        figureCount: String(ctx.programState.figures.length),
      },
    };
  },
});
