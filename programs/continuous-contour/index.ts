import {
  clamp,
  contentBounds,
  defineProgram,
  floatParam,
  generateContinuousContour,
  intParam,
  type Bounds,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";
import { contourLayout, contourTemplates } from "./data";

const canvas = {
  widthMm: 297,
  heightMm: 420,
  marginMm: 6,
} as const;

export const continuousContourParamSchema = {
  lines: intParam({
    min: 3,
    max: 64,
    default: 14,
    label: "Lines",
    group: "Contour",
  }),
  spacing: floatParam({
    min: 2,
    max: 24,
    default: 7.5,
    step: 0.1,
    label: "Spacing",
    group: "Contour",
    unit: "mm",
  }),
  samples: intParam({
    min: 4,
    max: 160,
    default: 36,
    label: "Samples",
    group: "Spline",
  }),
  caps: intParam({
    min: 4,
    max: 80,
    default: 18,
    label: "Cap Segments",
    group: "Spline",
  }),
  tension: floatParam({
    min: 0,
    max: 1,
    default: 0.18,
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
  const maxLines = Math.max(4, Math.floor((0.45 * Math.min(box.maxX - box.minX, box.maxY - box.minY)) / spacing));
  return clamp(Math.round(lines * scale), 4, maxLines);
}

export const program = defineProgram({
  id: "continuous-contour",
  title: "Continuous Contour",
  description: "The poster-style continuous contour composition from go-pen.",
  version: "1.0.0",
  canvas,
  params: continuousContourParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const page = contentBounds(canvas);
    const paths: Polyline[] = contourLayout.map((motif) => {
      const template = contourTemplates[motif.template];
      const box = resolveBox(page, motif.box);

      return generateContinuousContour(fitPoints(box, template.controls), {
        lanes: scaledLines(ctx.params.lines, ctx.params.spacing, box, template.lineScale),
        spacing: ctx.params.spacing,
        samplesPerSpan: ctx.params.samples,
        capSegments: ctx.params.caps,
        tension: ctx.params.tension,
      });
    });

    return {
      canvas,
      layers: [
        {
          id: "continuous-contour",
          label: "Continuous Contour",
          stroke: "#0f172a",
          paths,
        },
      ],
      metadata: {
        programId: "continuous-contour",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
