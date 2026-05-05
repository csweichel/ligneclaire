import {
  contentBounds,
  createPerlinVectorField,
  createRng,
  defineProgram,
  drawVectorField,
  excludePolylineFromPolygon,
  floatParam,
  intParam,
  traceNearestVectorField,
  type Bounds,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const clipFieldParamSchema = {
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
  maskScale: floatParam({
    min: 0.5,
    max: 2,
    default: 1,
    step: 0.05,
    label: "Mask Scale",
    group: "Mask",
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
    { x: center.x + 50 * scale, y: center.y - 25 * scale },
    { x: center.x + 25 * scale, y: center.y + 25 * scale },
    { x: center.x - 50 * scale, y: center.y + 25 * scale },
    { x: center.x - 25 * scale, y: center.y - 25 * scale },
  ];
}

function collectFieldPaths(
  count: number,
  rngSeed: number,
  field: ReturnType<typeof createPerlinVectorField>,
  bounds: Bounds,
  mask: readonly Point[],
  segmentLength: number,
  steps: number
): readonly Polyline[] {
  const rng = createRng(rngSeed);
  const paths: Polyline[] = [];

  for (let index = 0; index < count; index += 1) {
    const traced = traceNearestVectorField(field, randomPoint(bounds, rng), {
      segmentLength,
      steps,
      bounds,
    });

    if (traced.points.length < 2) {
      continue;
    }

    for (const segment of excludePolylineFromPolygon(traced, mask)) {
      if (segment.points.length > 1) {
        paths.push(index % 2 === 0 ? segment : { points: [...segment.points].reverse() });
      }
    }
  }

  return paths;
}

function outline(points: readonly Point[]): Polyline {
  return {
    closed: true,
    points: [...points],
  };
}

export const program = defineProgram({
  id: "clip-field",
  title: "Clipped Field",
  description: "A dense Perlin field with a clean polygonal void cut through its center.",
  version: "1.0.0",
  canvas,
  params: clipFieldParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const bounds = contentBounds(canvas);
    const field = createPerlinVectorField(bounds, {
      columns: 40,
      rows: 80,
      seed: ctx.params.seed,
      frequency: 2.5,
      octaves: 3,
      length: 8.75,
    });
    const mask = buildMask(ctx.params.maskScale);

    return {
      canvas,
      layers: [
        {
          id: "primary-field",
          label: "Primary Field",
          stroke: "#0f172a",
          paths: collectFieldPaths(
            ctx.params.primaryPaths,
            ctx.params.seed * 17 + 1,
            field,
            bounds,
            mask,
            ctx.params.segmentLength,
            ctx.params.steps
          ),
        },
        {
          id: "accent-field",
          label: "Accent Field",
          stroke: "#1d4ed8",
          paths: collectFieldPaths(
            ctx.params.accentPaths,
            ctx.params.seed * 29 + 7,
            field,
            bounds,
            mask,
            ctx.params.segmentLength,
            ctx.params.steps
          ),
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
            {
              id: "clip-mask",
              label: "Clip Mask",
              stroke: "#0f766e",
              paths: [outline(mask)],
            },
          ]
        : undefined,
      metadata: {
        programId: "clip-field",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
