import {
  clamp,
  contentBounds,
  defineProgram,
  floatParam,
  generateVoronoiNestedCells,
  intParam,
  plotPalette,
  sampleFunctionPath,
  type Bounds,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

const printable = contentBounds(canvas);
const printableWidth = printable.maxX - printable.minX;
const printableHeight = printable.maxY - printable.minY;
const PROGRAM_VERSION = "1.0.0";

export const voronoiNestedCellsParamSchema = {
  boundaryWidth: floatParam({
    min: 40,
    max: printableWidth,
    default: 150,
    step: 1,
    label: "Boundary Width",
    group: "Boundary",
    unit: "mm",
  }),
  boundaryHeight: floatParam({
    min: 40,
    max: printableHeight,
    default: 220,
    step: 1,
    label: "Boundary Height",
    group: "Boundary",
    unit: "mm",
  }),
  pointCount: intParam({
    min: 1,
    max: 200,
    default: 51,
    label: "Point Count",
    group: "Seeds",
  }),
  randomSeed: intParam({
    min: 1,
    max: 999999,
    default: 20,
    label: "Random Seed",
    group: "Seeds",
  }),
  filletRadius: floatParam({
    min: 0,
    max: 200,
    default: 100,
    step: 1,
    label: "Fillet Radius",
    group: "Cells",
    unit: "mm",
  }),
  layerCount: intParam({
    min: 1,
    max: 24,
    default: 10,
    label: "Layer Count",
    group: "Transform",
  }),
  scaleBase: floatParam({
    min: 0.1,
    max: 1.2,
    default: 0.9,
    step: 0.01,
    label: "Scale Base",
    group: "Transform",
  }),
  rotationStep: floatParam({
    min: -14,
    max: 14,
    default: 7,
    step: 0.05,
    label: "Rotation Step",
    group: "Transform",
    unit: "rad",
  }),
} as const;

function centeredBounds(width: number, height: number): Bounds {
  return {
    minX: printable.minX + (printableWidth - width) * 0.5,
    minY: printable.minY + (printableHeight - height) * 0.5,
    maxX: printable.maxX - (printableWidth - width) * 0.5,
    maxY: printable.maxY - (printableHeight - height) * 0.5,
  };
}

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
  id: "voronoi-nested-cells",
  title: "Voronoi Nested Cells",
  description:
    "Scatter seeded Voronoi cells inside a centered rectangle, fillet them, then scale and rotate nested copies around each rounded centroid.",
  version: PROGRAM_VERSION,
  canvas,
  params: voronoiNestedCellsParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const bounds = centeredBounds(ctx.params.boundaryWidth, ctx.params.boundaryHeight);
    const result = generateVoronoiNestedCells(bounds, {
      pointCount: ctx.params.pointCount,
      seed: ctx.params.randomSeed,
      filletRadius: ctx.params.filletRadius,
      layerCount: ctx.params.layerCount,
      scaleBase: ctx.params.scaleBase,
      rotationStep: ctx.params.rotationStep,
    });
    const averageCellSpan = Math.sqrt(
      (ctx.params.boundaryWidth * ctx.params.boundaryHeight) / Math.max(1, ctx.params.pointCount)
    );
    const debugRadius = clamp(averageCellSpan * 0.08, 0.35, 1.25);

    return {
      canvas,
      layers: [
        {
          id: "voronoi-nested-cells",
          label: "Voronoi Nested Cells",
          stroke: plotPalette.primary,
          paths: result.paths,
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "voronoi-seeds",
              label: "Voronoi Seeds",
              stroke: plotPalette.mask,
              paths: [
                {
                  points: result.boundary,
                  closed: true,
                },
                ...result.seedPoints.map((point) =>
                  makeCirclePath(point.x, point.y, debugRadius)
                ),
              ],
            },
          ]
        : undefined,
      metadata: {
        programId: "voronoi-nested-cells",
        version: PROGRAM_VERSION,
        mode: ctx.mode,
      },
    };
  },
});
