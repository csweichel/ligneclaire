import {
  boolParam,
  contentBounds,
  defineProgram,
  floatParam,
  generateHamiltonPaths,
  intParam,
  plotPalette,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 12,
} as const;

export const hamiltonPathsParamSchema = {
  seed: intParam({
    min: 1,
    max: 999999,
    default: 2417,
    label: "Seed",
    group: "Grid",
  }),
  columns: intParam({
    min: 2,
    max: 60,
    default: 21,
    label: "Columns",
    group: "Grid",
  }),
  rows: intParam({
    min: 2,
    max: 90,
    default: 31,
    label: "Rows",
    group: "Grid",
  }),
  strokeCount: intParam({
    min: 1,
    max: 12,
    default: 3,
    label: "Parallel Strokes",
    group: "Stroke",
  }),
  strokeSpacing: floatParam({
    min: 0.2,
    max: 12,
    default: 0.62,
    step: 0.02,
    label: "Stroke Gap",
    group: "Stroke",
    unit: "mm",
  }),
  cornerRadius: floatParam({
    min: 0,
    max: 24,
    default: 1.1,
    step: 0.05,
    label: "Corner Radius",
    group: "Stroke",
    unit: "mm",
  }),
  deflection: floatParam({
    min: 0,
    max: 8,
    default: 0,
    step: 0.05,
    label: "Deflection",
    group: "Stroke",
    unit: "mm",
  }),
  drawCenterlines: boolParam({
    default: false,
    label: "Draw Centerlines",
    group: "Stroke",
  }),
} as const;

export const program = defineProgram({
  id: "hamilton-paths",
  title: "Hamilton Paths",
  description:
    "A seeded Hamiltonian walk across a square grid, rendered as one or more parallel strokes.",
  version: "1.0.0",
  canvas,
  params: hamiltonPathsParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const result = generateHamiltonPaths(contentBounds(canvas), {
      rows: ctx.params.rows,
      cols: ctx.params.columns,
      seed: ctx.params.seed,
      strokeCount: ctx.params.strokeCount,
      strokeSpacing: ctx.params.strokeSpacing,
      cornerRadius: ctx.params.cornerRadius,
      deflection: ctx.params.deflection,
      drawCenterlines: ctx.params.drawCenterlines,
    });

    return {
      canvas,
      layers: [
        {
          id: "hamilton-paths",
          label: "Hamilton Paths",
          stroke: plotPalette.primary,
          paths: result.paths,
        },
      ],
      metadata: {
        programId: "hamilton-paths",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
