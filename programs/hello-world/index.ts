import {
  clipPolylineToBounds,
  contentBounds,
  createRng,
  defineProgram,
  floatParam,
  intParam,
  plotPalette,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const helloWorldParamSchema = {
  rays: intParam({
    min: 8,
    max: 120,
    default: 50,
    label: "Rays",
    group: "Structure",
  }),
  reach: floatParam({
    min: 120,
    max: 340,
    default: 275,
    step: 1,
    label: "Reach",
    group: "Structure",
    unit: "mm",
  }),
  spread: floatParam({
    min: 0.5,
    max: 2.4,
    default: 1.7,
    step: 0.05,
    label: "Spread",
    group: "Motion",
  }),
  wobble: floatParam({
    min: 0,
    max: 1,
    default: 0.08,
    step: 0.01,
    label: "Wobble",
    group: "Motion",
  }),
} as const;

export const program = defineProgram({
  id: "hello-world",
  title: "Hello World",
  description: "The original go-pen fan study: two mirrored sprays of long lines crossing the page.",
  version: "1.0.0",
  canvas,
  params: helloWorldParamSchema,
  validation: {
    cases: ["default"],
  },
  render(ctx) {
    const bounds = contentBounds(canvas);
    const height = bounds.maxY - bounds.minY;
    const leftPaths: Polyline[] = [];
    const rightPaths: Polyline[] = [];
    const leftNoise = createRng(ctx.params.rays * 17 + 1);
    const rightNoise = createRng(ctx.params.rays * 31 + 7);

    const appendClippedRay = (target: Polyline[], startX: number, endX: number, endY: number) => {
      const segments = clipPolylineToBounds(
        {
          points: [
            { x: startX, y: bounds.minY },
            { x: endX, y: endY },
          ],
        },
        bounds
      );

      for (const segment of segments) {
        const [first, last] = [segment.points[0], segment.points.at(-1)];
        if (!first || !last || (first.x === last.x && first.y === last.y)) {
          continue;
        }
        target.push(segment);
      }
    };

    for (let index = 0; index < ctx.params.rays; index += 1) {
      const angle = (Math.PI / ctx.params.rays) * index;
      const amplitude = height * ctx.params.spread;
      appendClippedRay(
        leftPaths,
        bounds.minX,
        bounds.minX + ctx.params.reach,
        bounds.minY +
          amplitude +
          amplitude * Math.cos(angle) +
          (leftNoise.next() - 0.5) * amplitude * ctx.params.wobble
      );
      appendClippedRay(
        rightPaths,
        bounds.maxX,
        bounds.maxX - ctx.params.reach,
        bounds.minY +
          amplitude +
          amplitude * Math.cos(angle) +
          (rightNoise.next() - 0.5) * amplitude * ctx.params.wobble
      );
    }

    return {
      canvas,
      layers: [
        {
          id: "left-fan",
          label: "Left Fan",
          stroke: plotPalette.primary,
          paths: leftPaths,
        },
        {
          id: "right-fan",
          label: "Right Fan",
          stroke: plotPalette.accent,
          paths: rightPaths,
        },
      ],
      metadata: {
        programId: "hello-world",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
