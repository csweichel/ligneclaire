import {
  boolParam,
  contentBounds,
  defineProgram,
  generateKochCurve,
  intParam,
  plotPalette,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const kochCurvesParamSchema = {
  iterations: intParam({
    min: 0,
    max: 6,
    default: 4,
    label: "Iterations",
    group: "Curve",
  }),
  snowflake: boolParam({
    default: true,
    label: "Snowflake",
    group: "Curve",
  }),
} as const;

export const program = defineProgram({
  id: "koch-curves",
  title: "Koch Curves",
  description: "Koch line work generated from a classic L-system, with an optional snowflake loop.",
  version: "1.0.0",
  canvas,
  params: kochCurvesParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const curve = generateKochCurve(
      ctx.params.iterations,
      contentBounds(canvas),
      ctx.params.snowflake
    );

    return {
      canvas,
      layers: [
        {
          id: "koch-curves",
          label: "Koch Curves",
          stroke: plotPalette.primary,
          paths: [curve],
        },
      ],
      metadata: {
        programId: "koch-curves",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
