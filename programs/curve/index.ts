import {
  boolParam,
  contentBounds,
  defineProgram,
  floatParam,
  intParam,
  lerp,
  sampleFunctionPath,
  type Bounds,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";
import { discreteCurveData } from "./data";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const curveParamSchema = {
  cycles: floatParam({
    min: 0.5,
    max: 8,
    default: 2,
    step: 0.1,
    label: "Cycles",
    group: "Continuous",
  }),
  samples: intParam({
    min: 40,
    max: 400,
    default: 100,
    label: "Samples",
    group: "Continuous",
  }),
  amplitude: floatParam({
    min: 0.2,
    max: 1,
    default: 1,
    step: 0.05,
    label: "Amplitude",
    group: "Continuous",
  }),
  showDiscrete: boolParam({
    default: true,
    label: "Show Discrete Curve",
    group: "Discrete",
  }),
} as const;

function centeredBox(): Bounds {
  const bounds = contentBounds(canvas);
  const width = (bounds.maxX - bounds.minX) * 0.5;
  const height = (bounds.maxY - bounds.minY) * 0.5;
  const center = {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };

  return {
    minX: center.x - width * 0.5,
    maxX: center.x + width * 0.5,
    minY: center.y - height * 0.5,
    maxY: center.y + height * 0.5,
  };
}

function fitDiscretePoints(points: readonly Point[], bounds: Bounds): Polyline {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(1e-6, maxX - minX);
  const height = Math.max(1e-6, maxY - minY);

  return {
    points: points.map((point) => ({
      x: bounds.minX + ((point.x - minX) / width) * (bounds.maxX - bounds.minX),
      y: bounds.minY + ((point.y - minY) / height) * (bounds.maxY - bounds.minY),
    })),
  };
}

export const program = defineProgram({
  id: "curve",
  title: "Continuous And Discrete Curve",
  description: "The go-pen curve example: a sampled sine wave overlaid with a simple discrete data polygon.",
  version: "1.0.0",
  canvas,
  params: curveParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const box = centeredBox();
    const continuous = sampleFunctionPath(
      (amount) => ({
        x: lerp(box.minX, box.maxX, amount),
        y:
          box.minY +
          ((Math.sin(amount * ctx.params.cycles * Math.PI * 2) + 1) * 0.5 * ctx.params.amplitude +
            (1 - ctx.params.amplitude) * 0.5) *
            (box.maxY - box.minY),
      }),
      0,
      1,
      ctx.params.samples
    );
    const discrete = fitDiscretePoints(
      discreteCurveData.xs.map((x, index) => ({
        x,
        y: discreteCurveData.ys[index]!,
      })),
      box
    );

    return {
      canvas,
      layers: [
        {
          id: "continuous",
          label: "Continuous Curve",
          stroke: "#0f172a",
          paths: [continuous],
        },
        {
          id: "discrete",
          label: "Discrete Curve",
          stroke: "#1d4ed8",
          paths: ctx.params.showDiscrete ? [discrete] : [],
        },
      ],
      metadata: {
        programId: "curve",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
