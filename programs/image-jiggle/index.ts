import {
  contentBounds,
  defineProgram,
  drawGrayscaleImageGrid,
  floatParam,
  goPenSampleGrid,
  intParam,
  sampleGrayscaleImageGrid,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const imageJiggleParamSchema = {
  lineCount: intParam({
    min: 20,
    max: 160,
    default: 80,
    label: "Lines",
    group: "Sampling",
  }),
  stepsPerLine: intParam({
    min: 120,
    max: 900,
    default: 600,
    label: "Steps Per Line",
    group: "Sampling",
  }),
  maxAmplitude: floatParam({
    min: 0.2,
    max: 4,
    default: 1.375,
    step: 0.025,
    label: "Maximum Amplitude",
    group: "Motion",
    unit: "mm",
  }),
  maxFrequency: floatParam({
    min: 0.05,
    max: 0.8,
    default: 0.48,
    step: 0.01,
    label: "Maximum Frequency",
    group: "Motion",
  }),
} as const;

export const program = defineProgram({
  id: "image-jiggle",
  title: "Image Jiggle",
  description: "A raster-derived sine jiggle field whose local frequency and amplitude follow image darkness.",
  version: "1.0.0",
  canvas,
  params: imageJiggleParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const bounds = contentBounds(canvas);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const dx = width / ctx.params.stepsPerLine;
    const dy = height / ctx.params.lineCount;
    const paths: Polyline[] = [];

    for (let line = 0; line < ctx.params.lineCount; line += 1) {
      const baseY = bounds.minY + line * dy;
      const points = [];
      let phase = 0;

      for (let step = 0; step <= ctx.params.stepsPerLine; step += 1) {
        const x = bounds.minX + step * dx;
        const sample = sampleGrayscaleImageGrid(goPenSampleGrid, { x, y: baseY }, bounds);
        const darkness = sample ? 1 - sample.luminosity : 0;
        const frequency = darkness * ctx.params.maxFrequency;
        const amplitude = darkness * ctx.params.maxAmplitude;
        phase += frequency * dx * Math.PI * 2;

        points.push({
          x,
          y: Math.max(bounds.minY, Math.min(bounds.maxY, baseY + amplitude * Math.sin(phase))),
        });
      }

      if (points.length > 1) {
        paths.push(line % 2 === 0 ? { points } : { points: [...points].reverse() });
      }
    }

    return {
      canvas,
      layers: [
        {
          id: "image-jiggle",
          label: "Image Jiggle",
          stroke: "#0f172a",
          paths,
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "image-samples",
              label: "Image Samples",
              stroke: "#0f766e",
              paths: drawGrayscaleImageGrid(goPenSampleGrid, bounds),
            },
          ]
        : undefined,
      metadata: {
        programId: "image-jiggle",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
