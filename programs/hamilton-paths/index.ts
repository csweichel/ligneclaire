import {
  boolParam,
  contentBounds,
  defineProgram,
  floatParam,
  generateHamiltonPaths,
  intParam,
  plotPalette,
  sampleFunctionPath,
  type Polyline,
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
  gridRotationDeg: floatParam({
    min: -180,
    max: 180,
    default: 0,
    step: 0.5,
    label: "Grid Rotation",
    group: "Grid",
    unit: "deg",
  }),
  latticeAngleDeg: floatParam({
    min: 15,
    max: 165,
    default: 90,
    step: 0.5,
    label: "Lattice Angle",
    group: "Grid",
    unit: "deg",
  }),
  rowStepRatio: floatParam({
    min: 0.2,
    max: 4,
    default: 1,
    step: 0.02,
    label: "Row Step Ratio",
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
  id: "hamilton-paths",
  title: "Hamilton Paths",
  description:
    "A seeded Hamiltonian walk across a configurable lattice, rendered as one or more parallel strokes.",
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
      gridRotationDeg: ctx.params.gridRotationDeg,
      latticeAngleDeg: ctx.params.latticeAngleDeg,
      rowStepRatio: ctx.params.rowStepRatio,
      strokeCount: ctx.params.strokeCount,
      strokeSpacing: ctx.params.strokeSpacing,
      cornerRadius: ctx.params.cornerRadius,
      deflection: ctx.params.deflection,
      drawCenterlines: ctx.params.drawCenterlines,
    });
    const debugRadius = Math.max(
      0.35,
      Math.min(result.cellSize * Math.min(1, ctx.params.rowStepRatio) * 0.18, 1.6)
    );

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
      debugLayers: ctx.showDebug
        ? [
            {
              id: "hamilton-base-nodes",
              label: "Base Nodes",
              stroke: plotPalette.mask,
              paths: result.baseNodes.map((point) =>
                makeCirclePath(point.x, point.y, debugRadius)
              ),
            },
          ]
        : undefined,
      metadata: {
        programId: "hamilton-paths",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
