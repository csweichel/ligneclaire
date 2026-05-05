import {
  boolParam,
  contentBounds,
  createPerlinVectorField,
  createRng,
  defineProgram,
  floatParam,
  intParam,
  clipPolylineToPolygon,
  plotPalette,
  traceContinuousVectorField,
  traceNearestVectorField,
  type Bounds,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 75,
  heightMm: 75,
  marginMm: 4,
} as const;

export const logoParamSchema = {
  seed: intParam({
    min: 1,
    max: 999999,
    default: 4589,
    label: "Seed",
    group: "Field",
  }),
  paths: intParam({
    min: 80,
    max: 2400,
    default: 1000,
    label: "Paths",
    group: "Density",
  }),
  scale: floatParam({
    min: 0.5,
    max: 1.8,
    default: 1,
    step: 0.05,
    label: "Mark Scale",
    group: "Mask",
  }),
  segmentLength: floatParam({
    min: 0.25,
    max: 4,
    default: 2.5,
    step: 0.05,
    label: "Segment Length",
    group: "Stroke",
    unit: "mm",
  }),
  steps: intParam({
    min: 2,
    max: 32,
    default: 10,
    label: "Steps",
    group: "Stroke",
  }),
  continuousCurves: boolParam({
    default: true,
    label: "Continuous Curves",
    group: "Stroke",
  }),
} as const;

function randomPoint(bounds: Bounds, rng: ReturnType<typeof createRng>) {
  return {
    x: rng.float(bounds.minX, bounds.maxX),
    y: rng.float(bounds.minY, bounds.maxY),
  };
}

function buildMask(scale: number): readonly Point[] {
  const bounds = contentBounds(canvas);
  const center = {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };

  return [
    { x: center.x - 7.5 * scale, y: center.y - 25.5 * scale },
    { x: center.x - 7.5 * scale, y: center.y + 18 * scale },
    { x: center.x, y: center.y + 24.75 * scale },
    { x: center.x + 7.5 * scale, y: center.y + 18 * scale },
    { x: center.x + 7.5 * scale, y: center.y - 25.5 * scale },
    { x: center.x - 7.5 * scale, y: center.y - 25.5 * scale },
  ];
}

function frame(bounds: Bounds): Polyline {
  return {
    closed: true,
    points: [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
    ],
  };
}

export const program = defineProgram({
  id: "logo",
  title: "Logo Field",
  description: "A compact flow field clipped into the original go-pen logo mark.",
  version: "1.0.0",
  canvas,
  params: logoParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const bounds = contentBounds(canvas);
    const field = createPerlinVectorField(bounds, {
      columns: 36,
      rows: 72,
      seed: ctx.params.seed,
      frequency: 2.5,
      octaves: 3,
      length: 6,
    });
    const mask = buildMask(ctx.params.scale);
    const rng = createRng(ctx.params.seed * 11 + 3);
    const inkPaths: Polyline[] = [];

    for (let index = 0; index < ctx.params.paths; index += 1) {
      const traced = ctx.params.continuousCurves
        ? traceContinuousVectorField(field, randomPoint(bounds, rng), {
            segmentLength: ctx.params.segmentLength,
            steps: ctx.params.steps,
            bounds,
          })
        : traceNearestVectorField(field, randomPoint(bounds, rng), {
            segmentLength: ctx.params.segmentLength,
            steps: ctx.params.steps,
            bounds,
          });

      if (traced.points.length < 2) {
        continue;
      }

      for (const segment of clipPolylineToPolygon(traced, mask)) {
        if (segment.points.length > 1) {
          inkPaths.push(index % 2 === 0 ? segment : { points: [...segment.points].reverse() });
        }
      }
    }

    return {
      canvas,
      layers: [
        {
          id: "logo-ink",
          label: "Logo Ink",
          stroke: plotPalette.primary,
          paths: inkPaths,
        },
        {
          id: "frame",
          label: "Frame",
          stroke: plotPalette.accent,
          paths: [frame(bounds)],
        },
      ],
      metadata: {
        programId: "logo",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
