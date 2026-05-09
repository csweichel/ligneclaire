import {
  clipPolylineToBounds,
  contentBounds,
  defineProgram,
  floatParam,
  generateDelaunayPaths,
  intParam,
  plotPalette,
  sampleFunctionPath,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const delaunayPathsParamSchema = {
  seed: intParam({
    min: 1,
    max: 999999,
    default: 2417,
    label: "Seed",
    group: "Points",
  }),
  columns: intParam({
    min: 2,
    max: 18,
    default: 7,
    label: "Columns",
    group: "Points",
  }),
  rows: intParam({
    min: 2,
    max: 24,
    default: 10,
    label: "Rows",
    group: "Points",
  }),
  jitter: floatParam({
    min: 0,
    max: 0.95,
    default: 0.42,
    step: 0.01,
    label: "Jitter",
    group: "Points",
  }),
} as const;

function makeCirclePath(centerX: number, centerY: number, radius: number, segments = 24): Polyline {
  return sampleFunctionPath(
    (amount) => {
      const angle = amount * Math.PI * 2;
      return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
    },
    0,
    1,
    segments
  );
}

export const program = defineProgram({
  id: "delaunay-paths",
  title: "Delaunay Paths",
  description: "A seeded jittered lattice triangulated into deterministic Delaunay edge paths.",
  version: "1.0.0",
  canvas,
  params: delaunayPathsParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const bounds = contentBounds(canvas);
    const result = generateDelaunayPaths(bounds, {
      rows: ctx.params.rows,
      cols: ctx.params.columns,
      seed: ctx.params.seed,
      jitter: ctx.params.jitter,
    });
    const stepX =
      ctx.params.columns > 1 ? (bounds.maxX - bounds.minX) / (ctx.params.columns - 1) : 0;
    const stepY =
      ctx.params.rows > 1 ? (bounds.maxY - bounds.minY) / (ctx.params.rows - 1) : 0;
    const debugRadius = Math.max(0.35, Math.min(Math.max(stepX, stepY) * 0.08, 1.4));

    return {
      canvas,
      layers: [
        {
          id: "delaunay-paths",
          label: "Delaunay Paths",
          stroke: plotPalette.primary,
          paths: result.paths,
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "delaunay-points",
              label: "Delaunay Points",
              stroke: plotPalette.mask,
              paths: result.points.flatMap((point) =>
                clipPolylineToBounds(
                  makeCirclePath(point.x, point.y, debugRadius),
                  bounds
                ).filter(
                  (path) =>
                    path.points.length >= 2 &&
                    path.points.some(
                      (candidate) =>
                        Math.abs(candidate.x - path.points[0]!.x) > 1e-6 ||
                        Math.abs(candidate.y - path.points[0]!.y) > 1e-6
                    )
                )
              ),
            },
          ]
        : undefined,
      metadata: {
        programId: "delaunay-paths",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
