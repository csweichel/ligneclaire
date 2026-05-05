import {
  contentBounds,
  createPerlinVectorField,
  createRng,
  defineProgram,
  drawVectorField,
  floatParam,
  intParam,
  traceNearestVectorField,
  type Bounds,
  type NormalizedParams,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const fieldParamSchema = {
  seed: intParam({
    min: 1,
    max: 999999,
    default: 4589,
    label: "Seed",
    group: "Field",
  }),
  primaryPaths: intParam({
    min: 120,
    max: 5000,
    default: 2200,
    label: "Primary Paths",
    group: "Density",
  }),
  accentPaths: intParam({
    min: 0,
    max: 1200,
    default: 220,
    label: "Accent Paths",
    group: "Density",
  }),
  segmentLength: floatParam({
    min: 0.5,
    max: 8,
    default: 2.5,
    step: 0.1,
    label: "Segment Length",
    group: "Stroke",
    unit: "mm",
  }),
  steps: intParam({
    min: 2,
    max: 64,
    default: 10,
    label: "Steps",
    group: "Stroke",
  }),
} as const;

type FieldParams = NormalizedParams<typeof fieldParamSchema>;

function randomPoint(bounds: Bounds, rng: ReturnType<typeof createRng>) {
  return {
    x: rng.float(bounds.minX, bounds.maxX),
    y: rng.float(bounds.minY, bounds.maxY),
  };
}

function collectFieldPaths(
  count: number,
  rngSeed: number,
  field: ReturnType<typeof createPerlinVectorField>,
  bounds: Bounds,
  segmentLength: number,
  steps: number
): readonly Polyline[] {
  const rng = createRng(rngSeed);
  const paths: Polyline[] = [];

  for (let index = 0; index < count; index += 1) {
    const path = traceNearestVectorField(field, randomPoint(bounds, rng), {
      segmentLength,
      steps,
      bounds,
    });
    if (path.points.length < 2) {
      continue;
    }

    paths.push(index % 2 === 0 ? path : { points: [...path.points].reverse() });
  }

  return paths;
}

function buildDocument(
  ctx: Readonly<{
    params: FieldParams;
  }>
) {
  const bounds = contentBounds(canvas);
  const field = createPerlinVectorField(bounds, {
    columns: 40,
    rows: 80,
    seed: ctx.params.seed,
    frequency: 2.5,
    octaves: 3,
    length: 8.75,
  });

  return {
    bounds,
    field,
    primaryPaths: collectFieldPaths(
      ctx.params.primaryPaths,
      ctx.params.seed * 17 + 1,
      field,
      bounds,
      ctx.params.segmentLength,
      ctx.params.steps
    ),
    accentPaths: collectFieldPaths(
      ctx.params.accentPaths,
      ctx.params.seed * 29 + 7,
      field,
      bounds,
      ctx.params.segmentLength,
      ctx.params.steps
    ),
  };
}

export const program = defineProgram({
  id: "field",
  title: "Perlin Field",
  description: "Flow-field traces sampled from a deterministic Perlin vector grid.",
  version: "1.0.0",
  canvas,
  params: fieldParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const { field, primaryPaths, accentPaths } = buildDocument(ctx);

    return {
      canvas,
      layers: [
        {
          id: "primary-field",
          label: "Primary Field",
          stroke: "#0f172a",
          paths: primaryPaths,
        },
        {
          id: "accent-field",
          label: "Accent Field",
          stroke: "#1d4ed8",
          paths: accentPaths,
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "vector-grid",
              label: "Vector Grid",
              stroke: "#dc2626",
              paths: drawVectorField(field),
            },
          ]
        : undefined,
      metadata: {
        programId: "field",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
