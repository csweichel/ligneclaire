import {
  contentBounds,
  defineProgram,
  generateHilbertCurve,
  floatParam,
  intParam,
  offsetPolyline,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 420,
  heightMm: 297,
  marginMm: 6,
} as const;

export const hilbertThickGradientParamSchema = {
  order: intParam({
    min: 2,
    max: 6,
    default: 4,
    label: "Order",
    group: "Curve",
  }),
  minExtra: intParam({
    min: 0,
    max: 80,
    default: 4,
    label: "Minimum Extra Strokes",
    group: "Stroke",
  }),
  maxExtra: intParam({
    min: 1,
    max: 120,
    default: 40,
    label: "Maximum Extra Strokes",
    group: "Stroke",
  }),
  step: floatParam({
    min: 0.1,
    max: 2,
    default: 0.72,
    step: 0.02,
    label: "Lane Step",
    group: "Stroke",
    unit: "mm",
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

function strokeOffsets(extra: number, step: number): number[] {
  const result: number[] = [];

  for (let index = 0; index < extra; index += 1) {
    const level = Math.floor(index / 2) + 1;
    const offset = level * step;
    result.push(index % 2 === 0 ? offset : -offset);
  }

  return result;
}

export const program = defineProgram({
  id: "hilbert-thick-gradient",
  title: "Hilbert Thick Gradient",
  description: "A landscape Hilbert curve thickened by an inside-out center gradient.",
  version: "1.0.0",
  canvas,
  params: hilbertThickGradientParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const bounds = contentBounds(canvas);
    const center = {
      x: (bounds.minX + bounds.maxX) * 0.5,
      y: (bounds.minY + bounds.maxY) * 0.5,
    };
    const path = generateHilbertCurve(ctx.params.order, bounds);
    const paths: Polyline[] = [];

    for (let index = 1; index < path.points.length; index += 1) {
      const segment: Polyline = {
        points: [path.points[index - 1]!, path.points[index]!],
      };
      const midpoint = {
        x: (segment.points[0]!.x + segment.points[1]!.x) * 0.5,
        y: (segment.points[0]!.y + segment.points[1]!.y) * 0.5,
      };
      const normalizedX = clamp01((midpoint.x - bounds.minX) / (bounds.maxX - bounds.minX));
      const normalizedY = clamp01((midpoint.y - bounds.minY) / (bounds.maxY - bounds.minY));
      const radius =
        Math.hypot(normalizedX - 0.5, normalizedY - 0.5) / 0.7071067811865476;
      const gradient = clamp01(1 - radius);
      const extra =
        ctx.params.minExtra +
        Math.round(gradient * (ctx.params.maxExtra - ctx.params.minExtra));

      paths.push(segment);
      for (const offset of strokeOffsets(extra, ctx.params.step)) {
        paths.push(offsetPolyline(segment, offset));
      }
    }

    return {
      canvas,
      layers: [
        {
          id: "hilbert-thick-gradient",
          label: "Hilbert Thick Gradient",
          stroke: "#0f172a",
          paths,
        },
      ],
      metadata: {
        programId: "hilbert-thick-gradient",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
