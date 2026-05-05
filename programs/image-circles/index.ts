import {
  contentBounds,
  defineProgram,
  drawGrayscaleImageGrid,
  floatParam,
  goPenSampleGrid,
  intParam,
  plotPalette,
  sampleFunctionPath,
  sampleGrayscaleImageGrid,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const imageCirclesParamSchema = {
  columns: intParam({
    min: 16,
    max: 80,
    default: 40,
    label: "Columns",
    group: "Sampling",
  }),
  rows: intParam({
    min: 16,
    max: 96,
    default: 55,
    label: "Rows",
    group: "Sampling",
  }),
  maxRadius: floatParam({
    min: 0.5,
    max: 6,
    default: 3,
    step: 0.1,
    label: "Maximum Radius",
    group: "Stroke",
    unit: "mm",
  }),
  minHatchSpacing: floatParam({
    min: 0.2,
    max: 2,
    default: 0.625,
    step: 0.025,
    label: "Minimum Hatch Spacing",
    group: "Stroke",
    unit: "mm",
  }),
  maxHatchSpacing: floatParam({
    min: 0.4,
    max: 4,
    default: 2,
    step: 0.05,
    label: "Maximum Hatch Spacing",
    group: "Stroke",
    unit: "mm",
  }),
} as const;

function circlePath(centerX: number, centerY: number, radius: number): Polyline {
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
    48
  );
}

export const program = defineProgram({
  id: "image-circles",
  title: "Image Circles",
  description: "A sampled grayscale image rendered as hatched circles.",
  version: "1.0.0",
  canvas,
  params: imageCirclesParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const bounds = contentBounds(canvas);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const dx = width / ctx.params.columns;
    const dy = height / ctx.params.rows;
    const paths: Polyline[] = [];

    for (let column = 0; column < ctx.params.columns; column += 1) {
      for (let row = 0; row < ctx.params.rows; row += 1) {
        const centerX = bounds.minX + (column + 0.5) * dx;
        const centerY = bounds.minY + (row + 0.5) * dy;
        const sample = sampleGrayscaleImageGrid(goPenSampleGrid, { x: centerX, y: centerY }, bounds);
        if (!sample) {
          continue;
        }

        const darkness = 1 - sample.luminosity;
        if (darkness < 0.05) {
          continue;
        }

        const radius = Math.max(0.25, darkness * ctx.params.maxRadius);
        paths.push(circlePath(centerX, centerY, radius));

        const hatchSpacing =
          ctx.params.maxHatchSpacing -
          darkness * (ctx.params.maxHatchSpacing - ctx.params.minHatchSpacing);
        const inverseSqrtTwo = 1 / Math.sqrt(2);

        for (let offset = -radius + hatchSpacing; offset < radius; offset += hatchSpacing) {
          const halfChordSquared = radius * radius - offset * offset;
          if (halfChordSquared <= 0) {
            continue;
          }

          const halfChord = Math.sqrt(halfChordSquared);
          const perpendicularX = offset * inverseSqrtTwo;
          const perpendicularY = -offset * inverseSqrtTwo;

          paths.push({
            points: [
              {
                x: centerX + perpendicularX - halfChord * inverseSqrtTwo,
                y: centerY + perpendicularY - halfChord * inverseSqrtTwo,
              },
              {
                x: centerX + perpendicularX + halfChord * inverseSqrtTwo,
                y: centerY + perpendicularY + halfChord * inverseSqrtTwo,
              },
            ],
          });
        }
      }
    }

    return {
      canvas,
      layers: [
        {
          id: "image-circles",
          label: "Image Circles",
          stroke: plotPalette.primary,
          paths,
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "image-samples",
              label: "Image Samples",
              stroke: plotPalette.mask,
              paths: drawGrayscaleImageGrid(goPenSampleGrid, bounds),
            },
          ]
        : undefined,
      metadata: {
        programId: "image-circles",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
