import {
  clamp,
  contentBounds,
  defineProgram,
  floatParam,
  intParam,
  lazyEditor,
  lerp,
  sampleFunctionPath,
  type NormalizedParams,
  type Point,
  type Polyline,
  type ProgramRenderContext,
} from "@ligneclaire/sdk";

export const programParamSchema = {
  seed: intParam({
    min: 1,
    max: 999999,
    default: 1337,
    label: "Seed",
    group: "Structure",
  }),
  lines: intParam({
    min: 4,
    max: 120,
    default: 24,
    label: "Lines",
    group: "Structure",
  }),
  amplitude: floatParam({
    min: 0,
    max: 40,
    default: 10,
    step: 0.1,
    label: "Amplitude",
    group: "Motion",
    unit: "mm",
  }),
} as const;

export type ProgramSchema = typeof programParamSchema;
export type ProgramParams = NormalizedParams<ProgramSchema>;

export type ProgramState = Readonly<{
  focus: Point;
}>;

type RenderContext = ProgramRenderContext<ProgramSchema, ProgramState>;

const canvas = {
  widthMm: 297,
  heightMm: 210,
  marginMm: 12,
} as const;

function defaultState(): ProgramState {
  return {
    focus: {
      x: canvas.widthMm / 2,
      y: canvas.heightMm / 2,
    },
  };
}

function normalizeProgramState(input: unknown): ProgramState {
  const fallback = defaultState();
  const bounds = contentBounds(canvas);

  if (!input || typeof input !== "object") {
    return fallback;
  }

  const candidate = input as Record<string, unknown>;
  const focusCandidate =
    candidate.focus && typeof candidate.focus === "object"
      ? (candidate.focus as Record<string, unknown>)
      : null;

  const x =
    typeof focusCandidate?.x === "number" && Number.isFinite(focusCandidate.x)
      ? clamp(focusCandidate.x, bounds.minX, bounds.maxX)
      : fallback.focus.x;
  const y =
    typeof focusCandidate?.y === "number" && Number.isFinite(focusCandidate.y)
      ? clamp(focusCandidate.y, bounds.minY, bounds.maxY)
      : fallback.focus.y;

  return {
    focus: { x, y },
  };
}

function buildLine(index: number, params: ProgramParams, state: ProgramState): Polyline {
  const bounds = contentBounds(canvas);
  const baseY = lerp(bounds.minY, bounds.maxY, params.lines === 1 ? 0.5 : index / (params.lines - 1));
  return sampleFunctionPath(
    (t) => {
      const x = lerp(bounds.minX, bounds.maxX, t);
      const distanceFromFocus = Math.abs(state.focus.x - x) / (bounds.maxX - bounds.minX);
      return {
        x,
        y:
          baseY +
          Math.sin(t * Math.PI * 2 * 2.4 + index * 0.32) *
            params.amplitude *
            (1 - distanceFromFocus * 0.65),
      };
    },
    0,
    1,
    180
  );
}

export const program = defineProgram({
  id: "__PROGRAM_ID__",
  title: "__PROGRAM_TITLE__",
  description: "Replace this description with the visual intent of the program.",
  version: "1.0.0",
  canvas,
  params: programParamSchema,
  defaultProgramState: defaultState,
  normalizeProgramState,
  validation: {
    cases: ["default"],
    budgets: {
      maxRenderMs: 250,
      maxArtLayers: 1,
      maxPaths: 160,
      maxSegments: 40000,
      maxDrawDistanceMm: 100000,
      maxPenUpDistanceMm: 2000,
    },
  },
  editor: lazyEditor(() => import("./editor")),
  render(ctx: RenderContext) {
    const paths: Polyline[] = [];
    for (let index = 0; index < ctx.params.lines; index += 1) {
      const line = buildLine(index, ctx.params, ctx.programState);
      paths.push(index % 2 === 0 ? line : { ...line, points: [...line.points].reverse() });
    }

    return {
      canvas,
      layers: [
        {
          id: "__PROGRAM_ID__-lines",
          label: "__PROGRAM_TITLE__",
          stroke: "#111827",
          paths,
        },
      ],
      debugLayers: [
        {
          id: "__PROGRAM_ID__-focus",
          label: "Focus",
          stroke: "#dc2626",
          paths: [
            {
              points: [
                { x: ctx.programState.focus.x - 6, y: ctx.programState.focus.y },
                { x: ctx.programState.focus.x + 6, y: ctx.programState.focus.y },
              ],
            },
            {
              points: [
                { x: ctx.programState.focus.x, y: ctx.programState.focus.y - 6 },
                { x: ctx.programState.focus.x, y: ctx.programState.focus.y + 6 },
              ],
            },
          ],
        },
      ],
      metadata: {
        programId: "__PROGRAM_ID__",
        version: "1.0.0",
      },
    };
  },
});

