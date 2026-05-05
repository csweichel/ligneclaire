import {
  clamp,
  contentBounds,
  defineProgram,
  floatParam,
  generateContinuousContour,
  intParam,
  plotPalette,
  type Bounds,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";
import { posterLayout, posterTemplates } from "./data";

const canvas = {
  widthMm: 300,
  heightMm: 450,
  marginMm: 6,
} as const;

export const referencePosterParamSchema = {
  lines: intParam({
    min: 4,
    max: 40,
    default: 16,
    label: "Lines",
    group: "Contour",
  }),
  spacing: floatParam({
    min: 3,
    max: 18,
    default: 7.2,
    step: 0.1,
    label: "Spacing",
    group: "Contour",
    unit: "mm",
  }),
  samples: intParam({
    min: 8,
    max: 220,
    default: 40,
    label: "Samples",
    group: "Spline",
  }),
  caps: intParam({
    min: 6,
    max: 80,
    default: 20,
    label: "Cap Segments",
    group: "Spline",
  }),
  tension: floatParam({
    min: 0,
    max: 1,
    default: 0.38,
    step: 0.01,
    label: "Tension",
    group: "Spline",
  }),
} as const;

type LayoutBox = Readonly<{ x: number; y: number; w: number; h: number }>;

function resolveBox(page: Bounds, box: LayoutBox): Bounds {
  const width = page.maxX - page.minX;
  const height = page.maxY - page.minY;

  return {
    minX: page.minX + width * box.x,
    minY: page.minY + height * box.y,
    maxX: page.minX + width * (box.x + box.w),
    maxY: page.minY + height * (box.y + box.h),
  };
}

function fitPoints(box: Bounds, points: readonly Readonly<{ x: number; y: number }>[]): Point[] {
  return points.map((point) => ({
    x: box.minX + (box.maxX - box.minX) * point.x,
    y: box.minY + (box.maxY - box.minY) * point.y,
  }));
}

function scaledLines(lines: number, spacing: number, box: Bounds, scale: number): number {
  const maxLines = Math.max(5, Math.floor((0.45 * Math.min(box.maxX - box.minX, box.maxY - box.minY)) / spacing));
  return clamp(Math.round(lines * scale), 5, maxLines);
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
  id: "reference-poster",
  title: "Reference Poster",
  description: "The large-format reference poster composition from go-pen.",
  version: "1.0.0",
  canvas,
  params: referencePosterParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const page = contentBounds(canvas);
    const paths: Polyline[] = posterLayout.map((motif) => {
      const template = posterTemplates[motif.template];
      const box = resolveBox(page, motif.box);

      return generateContinuousContour(fitPoints(box, template.controls), {
        lanes: scaledLines(ctx.params.lines, ctx.params.spacing * template.spacingScale, box, template.lineScale),
        spacing: ctx.params.spacing * template.spacingScale,
        samplesPerSpan: ctx.params.samples,
        capSegments: ctx.params.caps,
        tension: clamp01(ctx.params.tension * template.tensionScale),
      });
    });

    return {
      canvas,
      layers: [
        {
          id: "reference-poster",
          label: "Reference Poster",
          stroke: plotPalette.primary,
          paths,
        },
      ],
      metadata: {
        programId: "reference-poster",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
