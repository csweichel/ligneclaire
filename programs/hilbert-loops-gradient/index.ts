import {
  createProgressiveOffsetPaths,
  contentBounds,
  defineProgram,
  generateHilbertCurve,
  intParam,
  plotPalette,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 297,
  heightMm: 420,
  marginMm: 8,
} as const;

export const hilbertLoopsGradientParamSchema = {
  loops: intParam({
    min: 2,
    max: 3,
    default: 3,
    label: "Loops",
    group: "Structure",
  }),
  order: intParam({
    min: 4,
    max: 7,
    default: 6,
    label: "Order",
    group: "Structure",
  }),
  thickness: intParam({
    min: 8,
    max: 40,
    default: 26,
    label: "Maximum Thickness",
    group: "Stroke",
  }),
  base: intParam({
    min: 0,
    max: 20,
    default: 6,
    label: "Base Thickness",
    group: "Stroke",
  }),
} as const;

function loopScale(index: number, loops: number): number {
  if (loops <= 1) {
    return 0.9;
  }

  const start = 0.98;
  const end = 0.56;
  return start + (end - start) * (index / (loops - 1));
}

function loopRotation(index: number): number {
  return index * 0.23;
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

function rotateAndScale(point: Point, center: Point, side: number, angle: number): Point {
  const x = point.x * side * 0.5;
  const y = point.y * side * 0.5;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  return {
    x: center.x + x * cosine - y * sine,
    y: center.y + x * sine + y * cosine,
  };
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export const program = defineProgram({
  id: "hilbert-loops-gradient",
  title: "Hilbert Loops Gradient",
  description: "Nested Hilbert loops that thicken towards the shared center mass.",
  version: "1.0.0",
  canvas,
  params: hilbertLoopsGradientParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const bounds = contentBounds(canvas);
    const center = {
      x: (bounds.minX + bounds.maxX) * 0.5,
      y: (bounds.minY + bounds.maxY) * 0.5,
    };
    const side = Math.max(20, Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) - 16);
    const base = generateHilbertCurve(ctx.params.order, {
      minX: -1,
      minY: -1,
      maxX: 1,
      maxY: 1,
    });
    const paths: Polyline[] = [];

    for (let loopIndex = 0; loopIndex < ctx.params.loops; loopIndex += 1) {
      const scale = loopScale(loopIndex, ctx.params.loops);
      const rotation = loopRotation(loopIndex);
      const loopPath: Polyline = {
        points: base.points.map((point) =>
          rotateAndScale(point, center, side * scale, rotation)
        ),
      };
      const segmentExtras = Array.from(
        { length: Math.max(0, loopPath.points.length - 1) },
        (_, index) => {
          const segment: Polyline = {
            points: [loopPath.points[index]!, loopPath.points[index + 1]!],
          };
          const midpoint = {
            x: (segment.points[0]!.x + segment.points[1]!.x) * 0.5,
            y: (segment.points[0]!.y + segment.points[1]!.y) * 0.5,
          };
          const radius = Math.hypot(midpoint.x - center.x, midpoint.y - center.y);
          const inside = 1 - clamp01(radius / (side * 0.52));
          const boost = 1 + loopIndex * 0.14;
          return (
            ctx.params.base +
            Math.round(
              Math.pow(inside, 2.2) *
                (ctx.params.thickness - ctx.params.base) *
                boost
            )
          );
        }
      );
      const maxExtra = segmentExtras.reduce(
        (maximum, count) => Math.max(maximum, count),
        0
      );

      paths.push(loopPath);
      paths.push(
        ...createProgressiveOffsetPaths(
          loopPath,
          segmentExtras,
          strokeOffsets(maxExtra, 0.8)
        )
      );
    }

    return {
      canvas,
      layers: [
        {
          id: "hilbert-loops-gradient",
          label: "Hilbert Loops Gradient",
          stroke: plotPalette.primary,
          paths,
        },
      ],
      metadata: {
        programId: "hilbert-loops-gradient",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
