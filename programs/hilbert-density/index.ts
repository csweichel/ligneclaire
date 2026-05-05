import {
  contentBounds,
  createFractalNoise2D,
  defineProgram,
  generateHilbertCurve,
  intParam,
  offsetPolyline,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const hilbertDensityParamSchema = {
  order: intParam({
    min: 1,
    max: 9,
    default: 7,
    label: "Order",
    group: "Curve",
  }),
} as const;

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function densityAt(point: Point, bounds: ReturnType<typeof contentBounds>): number {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const normalizedX = clamp01((point.x - bounds.minX) / width);
  const normalizedY = clamp01((point.y - bounds.minY) / height);
  const noiseValue = 0.5 + 0.5 * densityNoise(normalizedX * 2.5, normalizedY * 2.5);
  const stripes = 0.5 + 0.5 * Math.sin(12 * (normalizedX * 0.7 + normalizedY * 1.1));
  const radialDistance =
    Math.hypot(normalizedX - 0.5, normalizedY - 0.5) / 0.7071067811865476;
  const center = 1 - clamp01(radialDistance);

  return clamp01(0.5 * noiseValue + 0.25 * stripes + 0.25 * center);
}

const densityNoise = createFractalNoise2D(91991, {
  octaves: 4,
  persistence: 0.55,
  lacunarity: 2.1,
});

function layerOffsets(extra: number): number[] {
  const result: number[] = [];
  const step = 0.55;

  for (let index = 0; index < extra; index += 1) {
    const level = Math.floor(index / 2) + 1;
    const offset = level * step;
    result.push(index % 2 === 0 ? offset : -offset);
  }

  return result;
}

export const program = defineProgram({
  id: "hilbert-density",
  title: "Hilbert Density",
  description: "A Hilbert curve with locally thickened segments driven by stripes, noise, and center bias.",
  version: "1.0.0",
  canvas,
  params: hilbertDensityParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const baseBounds = contentBounds(canvas);
    const bounds = {
      minX: baseBounds.minX + 1,
      minY: baseBounds.minY + 1,
      maxX: baseBounds.maxX - 1,
      maxY: baseBounds.maxY - 1,
    };
    const hilbert = generateHilbertCurve(ctx.params.order, bounds);
    const paths: Polyline[] = [];

    for (let index = 1; index < hilbert.points.length; index += 1) {
      const segment: Polyline = {
        points: [hilbert.points[index - 1]!, hilbert.points[index]!],
      };
      const midpoint = {
        x: (segment.points[0]!.x + segment.points[1]!.x) * 0.5,
        y: (segment.points[0]!.y + segment.points[1]!.y) * 0.5,
      };
      const extra = Math.round(Math.pow(densityAt(midpoint, baseBounds), 1.6) * 10);

      paths.push(segment);
      for (const offset of layerOffsets(extra)) {
        paths.push(offsetPolyline(segment, offset));
      }
    }

    return {
      canvas,
      layers: [
        {
          id: "hilbert-density",
          label: "Hilbert Density",
          stroke: "#0f172a",
          paths,
        },
      ],
      metadata: {
        programId: "hilbert-density",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
