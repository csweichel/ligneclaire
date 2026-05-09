import {
  contentBounds,
  defineProgram,
  generatePeanoCurve,
  intParam,
  plotPalette,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const peanoCurveParamSchema = {
  order: intParam({
    min: 1,
    max: 4,
    default: 3,
    label: "Order",
    group: "Curve",
  }),
} as const;

export const program = defineProgram({
  id: "peano-curve",
  title: "Peano Curve",
  description: "A Peano-style space-filling curve generated from a 90-degree L-system.",
  version: "1.0.0",
  canvas,
  params: peanoCurveParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const curve = generatePeanoCurve(ctx.params.order, contentBounds(canvas));

    return {
      canvas,
      layers: [
        {
          id: "peano-curve",
          label: "Peano Curve",
          stroke: plotPalette.primary,
          paths: [curve],
        },
      ],
      metadata: {
        programId: "peano-curve",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
