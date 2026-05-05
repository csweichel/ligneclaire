import {
  clamp,
  contentBounds,
  createPerlinNoise2D,
  defineProgram,
  floatParam,
  intParam,
  lazyEditor,
  lerp,
  plotPalette,
  sampleFunctionPath,
  type NormalizedParams,
  type Point,
  type Polyline,
  type ProgramRenderContext,
} from "@ligneclaire/sdk";
import { boolParam } from "@ligneclaire/sdk";

export const wavesParamSchema = {
  seed: intParam({
    min: 1,
    max: 999999,
    default: 1337,
    label: "Seed",
    group: "Structure",
  }),
  bands: intParam({
    min: 6,
    max: 180,
    default: 54,
    label: "Bands",
    group: "Structure",
  }),
  amplitude: floatParam({
    min: 0,
    max: 40,
    default: 12,
    step: 0.1,
    label: "Amplitude",
    group: "Wave",
    unit: "mm",
  }),
  frequency: floatParam({
    min: 0.25,
    max: 8,
    default: 2.2,
    step: 0.05,
    label: "Frequency",
    group: "Wave",
  }),
  warp: floatParam({
    min: 0,
    max: 2,
    default: 0.65,
    step: 0.01,
    label: "Noise Warp",
    group: "Wave",
  }),
  mirror: boolParam({
    default: true,
    label: "Mirror Focus",
    group: "Wave",
  }),
} as const;

export type WavesSchema = typeof wavesParamSchema;
export type WavesParams = NormalizedParams<WavesSchema>;
type WavesRenderContext = ProgramRenderContext<WavesSchema, WavesProgramState>;

export type WavesProgramState = Readonly<{
  focus: Point;
  falloff: number;
}>;

const canvas = {
  widthMm: 420,
  heightMm: 297,
  marginMm: 10,
} as const;

const defaultProgramState = (): WavesProgramState => ({
  focus: {
    x: canvas.widthMm / 2,
    y: canvas.heightMm / 2,
  },
  falloff: 0.42,
});

function normalizeProgramState(input: unknown): WavesProgramState {
  const fallback = defaultProgramState();
  const bounds = contentBounds(canvas);

  if (!input || typeof input !== "object") {
    return fallback;
  }

  const candidate = input as Record<string, unknown>;
  const focusCandidate =
    candidate.focus && typeof candidate.focus === "object"
      ? (candidate.focus as Record<string, unknown>)
      : null;

  const focusX =
    typeof focusCandidate?.x === "number" && Number.isFinite(focusCandidate.x)
      ? clamp(focusCandidate.x, bounds.minX, bounds.maxX)
      : fallback.focus.x;
  const focusY =
    typeof focusCandidate?.y === "number" && Number.isFinite(focusCandidate.y)
      ? clamp(focusCandidate.y, bounds.minY, bounds.maxY)
      : fallback.focus.y;
  const falloff =
    typeof candidate.falloff === "number" && Number.isFinite(candidate.falloff)
      ? clamp(candidate.falloff, 0.15, 0.9)
      : fallback.falloff;

  return {
    focus: { x: focusX, y: focusY },
    falloff,
  };
}

function makeGuideCircle(center: Point, radius: number, segments = 48): Polyline {
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

function reversePolyline(polyline: Polyline): Polyline {
  return {
    ...polyline,
    points: [...polyline.points].reverse(),
  };
}

function buildWavePath(
  bandIndex: number,
  params: WavesParams,
  programState: WavesProgramState
): Polyline {
  const bounds = contentBounds(canvas);
  const noise = createPerlinNoise2D(params.seed);
  const bandPosition = params.bands === 1 ? 0.5 : bandIndex / (params.bands - 1);
  const baseY = lerp(bounds.minY, bounds.maxY, bandPosition);
  const focus = programState.focus;
  const samples = 220;

  return sampleFunctionPath(
    (t) => {
      const x = lerp(bounds.minX, bounds.maxX, t);
      const dx = (x - focus.x) / (bounds.maxX - bounds.minX);
      const dy = (baseY - focus.y) / (bounds.maxY - bounds.minY);
      const distanceWeight = Math.exp(-(dx * dx + dy * dy) / Math.max(0.01, programState.falloff));
      const wave = Math.sin(t * Math.PI * 2 * params.frequency + bandIndex * 0.18);
      const warp = noise(t * 3 + bandIndex * 0.09, bandIndex * 0.14) * params.warp * 5;
      const mirrored = params.mirror ? Math.cos((1 - t) * Math.PI * params.frequency) * 0.55 : 0;
      const amplitude = params.amplitude * (0.45 + distanceWeight * 1.4);

      return {
        x,
        y: clamp(
          baseY + wave * amplitude + mirrored * amplitude * 0.35 + warp,
          bounds.minY,
          bounds.maxY
        ),
      };
    },
    0,
    1,
    samples
  );
}

export const program = defineProgram({
  id: "waves",
  title: "Focused Waves",
  description: "Two-layer wave bands shaped by a draggable focal point and a soft falloff field.",
  version: "1.0.0",
  canvas,
  params: wavesParamSchema,
  defaultProgramState,
  normalizeProgramState,
  validation: {
    cases: ["default", "dense-a3"],
    budgets: {
      maxRenderMs: 250,
      maxArtLayers: 2,
      maxPaths: 220,
      maxSegments: 60000,
      maxDrawDistanceMm: 200000,
      maxPenUpDistanceMm: 4000,
    },
  },
  editor: lazyEditor(() => import("./editor")),
  render(ctx: WavesRenderContext) {
    const warmPaths: Polyline[] = [];
    const coolPaths: Polyline[] = [];

    for (let bandIndex = 0; bandIndex < ctx.params.bands; bandIndex += 1) {
      const path = buildWavePath(bandIndex, ctx.params, ctx.programState);
      const target = bandIndex % 2 === 0 ? warmPaths : coolPaths;
      target.push(target.length % 2 === 0 ? path : reversePolyline(path));
    }

    const focusRadius = lerp(22, 90, ctx.programState.falloff);
    const debugPaths = [...makeCrosshair(ctx.programState.focus, 8), makeGuideCircle(ctx.programState.focus, focusRadius)];

    return {
      canvas,
      layers: [
        {
          id: "warm-field",
          label: "Warm Field",
          stroke: plotPalette.accent,
          paths: warmPaths,
        },
        {
          id: "cool-field",
          label: "Cool Field",
          stroke: plotPalette.primary,
          paths: coolPaths,
        },
      ],
      debugLayers: [
        {
          id: "focus-guide",
          label: "Focus Guide",
          stroke: plotPalette.mask,
          paths: debugPaths,
        },
      ],
      metadata: {
        programId: "waves",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
