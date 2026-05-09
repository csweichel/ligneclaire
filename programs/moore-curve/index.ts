import {
  contentBounds,
  defineProgram,
  generateMooreCurve,
  intParam,
  plotPalette,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const mooreCurveParamSchema = {
  order: intParam({
    min: 1,
    max: 5,
    default: 4,
    label: "Order",
    group: "Curve",
  }),
} as const;

export const program = defineProgram({
  id: "moore-curve",
  title: "Moore Curve",
  description: "A closed Moore space-filling loop derived from the Hilbert L-system rules.",
  version: "1.0.0",
  canvas,
  params: mooreCurveParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const curve = generateMooreCurve(ctx.params.order, contentBounds(canvas));

    return {
      canvas,
      layers: [
        {
          id: "moore-curve",
          label: "Moore Curve",
          stroke: plotPalette.primary,
          paths: [curve],
        },
      ],
      metadata: {
        programId: "moore-curve",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
