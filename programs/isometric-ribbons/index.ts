import {
  boolParam,
  clipPolylineToBounds,
  contentBounds,
  createFractalNoise2D,
  defineProgram,
  floatParam,
  intParam,
  offsetPolyline,
  plotPalette,
  type Bounds,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 12,
} as const;

const SQRT3_OVER_2 = Math.sqrt(3) * 0.5;

const ribbonPalette = {
  dark: "#2444A2",
  light: "#6AD4F5",
} as const;

export const isometricRibbonsParamSchema = {
  seed: intParam({
    min: 1,
    max: 999999,
    default: 2718,
    label: "Seed",
    group: "Field",
  }),
  cellSize: floatParam({
    min: 4,
    max: 18,
    default: 8.4,
    step: 0.1,
    label: "Cell Size",
    group: "Grid",
    unit: "mm",
  }),
  lanes: intParam({
    min: 2,
    max: 7,
    default: 4,
    label: "Ribbon Lanes",
    group: "Stroke",
  }),
  laneGap: floatParam({
    min: 0.25,
    max: 1.4,
    default: 0.62,
    step: 0.01,
    label: "Lane Gap",
    group: "Stroke",
    unit: "mm",
  }),
  fieldScale: floatParam({
    min: 0.25,
    max: 3,
    default: 1.05,
    step: 0.01,
    label: "Field Scale",
    group: "Field",
  }),
  disorder: floatParam({
    min: 0,
    max: 1,
    default: 0.28,
    step: 0.01,
    label: "Disorder",
    group: "Field",
  }),
  dualHanded: boolParam({
    default: true,
    label: "Dual-Handed Motifs",
    group: "Field",
  }),
} as const;

function centeredSquareBounds(): Bounds {
  const bounds = contentBounds(canvas);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const side = Math.min(width, height);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;

  return {
    minX: centerX - side * 0.5,
    maxX: centerX + side * 0.5,
    minY: centerY - side * 0.5,
    maxY: centerY + side * 0.5,
  };
}

function positiveMod(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function hash01(seed: number, row: number, col: number): number {
  const value = Math.sin(seed * 12.9898 + row * 78.233 + col * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function symmetricOffsets(count: number, gap: number): number[] {
  const middle = (count - 1) * 0.5;
  return Array.from({ length: count }, (_, index) => (index - middle) * gap);
}

function outline(bounds: Bounds): Polyline {
  return {
    closed: true,
    points: [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
    ],
  };
}

function createMotif(step: number, mirrored: boolean): Polyline {
  const diagonalY = mirrored ? 1 : -1;
  const h = step * SQRT3_OVER_2;
  const rawPoints = [
    { x: 0, y: 0 },
    { x: step * 1.18, y: 0 },
    { x: step * 1.77, y: diagonalY * h },
    { x: step * 0.59, y: diagonalY * h },
    { x: step * 1.18, y: diagonalY * h * 2 },
    { x: step * 2.36, y: diagonalY * h * 2 },
  ];
  const xs = rawPoints.map((point) => point.x);
  const ys = rawPoints.map((point) => point.y);
  const center = {
    x: (Math.min(...xs) + Math.max(...xs)) * 0.5,
    y: (Math.min(...ys) + Math.max(...ys)) * 0.5,
  };

  return {
    points: rawPoints.map((point) => ({
      x: point.x - center.x,
      y: point.y - center.y,
    })),
  };
}

function rotatePoint(point: Point, radians: number): Point {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function transformPolyline(polyline: Polyline, center: Point, radians: number): Polyline {
  return {
    points: polyline.points.map((point) => {
      const rotated = rotatePoint(point, radians);
      return {
        x: center.x + rotated.x,
        y: center.y + rotated.y,
      };
    }),
  };
}

export const program = defineProgram({
  id: "isometric-ribbons",
  title: "Isometric Ribbons",
  description:
    "A dense field of offset isometric staircase curves, arranged on a staggered lattice to echo woven blue ribbon studies.",
  version: "1.0.0",
  canvas,
  params: isometricRibbonsParamSchema,
  validation: {
    cases: ["default"],
    budgets: {
      maxRenderMs: 200,
      maxArtLayers: 2,
      maxPaths: 2200,
      maxSegments: 16000,
      maxDrawDistanceMm: 220000,
      maxPenUpDistanceMm: 40000,
    },
  },
  render(ctx) {
    const bounds = centeredSquareBounds();
    const span = bounds.maxX - bounds.minX;
    const directionNoise = createFractalNoise2D(ctx.params.seed, {
      octaves: 3,
      persistence: 0.58,
      lacunarity: 1.95,
    });
    const mirrorNoise = createFractalNoise2D(ctx.params.seed * 7 + 19, {
      octaves: 2,
      persistence: 0.5,
      lacunarity: 2.25,
    });
    const rowStep = ctx.params.cellSize * 1.34;
    const colStep = ctx.params.cellSize * 1.58;
    const offsets = symmetricOffsets(ctx.params.lanes, ctx.params.laneGap);
    const primaryPaths: Polyline[] = [];
    const accentPaths: Polyline[] = [];
    const debugPaths: Polyline[] = [outline(bounds)];
    const verticalMargin = ctx.params.cellSize * 1.8;
    const horizontalMargin = ctx.params.cellSize * 1.8;
    const rows = Math.ceil((span + verticalMargin * 2) / rowStep) + 1;
    const cols = Math.ceil((span + horizontalMargin * 2) / colStep) + 2;

    for (let row = 0; row < rows; row += 1) {
      const centerY = bounds.minY - verticalMargin + row * rowStep;
      const rowOffset = row % 2 === 0 ? 0 : colStep * 0.5;

      for (let col = 0; col < cols; col += 1) {
        const centerX = bounds.minX - horizontalMargin + rowOffset + col * colStep;
        const fieldX = ((centerX - bounds.minX) / span) * ctx.params.fieldScale * 3.1;
        const fieldY = ((centerY - bounds.minY) / span) * ctx.params.fieldScale * 3.1;
        const noiseValue =
          directionNoise(fieldX + 17.3, fieldY - 9.1) * 0.82 +
          directionNoise(fieldX * 1.9 - 5.4, fieldY * 1.9 + 3.2) * ctx.params.disorder * 0.38 +
          (hash01(ctx.params.seed, row, col) - 0.5) * ctx.params.disorder * 0.55;
        const orientation =
          noiseValue < -0.24 ? 0 : noiseValue > 0.24 ? 2 : 1;
        const mirrored =
          ctx.params.dualHanded &&
          mirrorNoise(fieldX + 4.7, fieldY - 12.8) +
            (hash01(ctx.params.seed * 3 + 11, row, col) - 0.5) * ctx.params.disorder >
            0;
        const motif = transformPolyline(
          createMotif(ctx.params.cellSize, mirrored),
          { x: centerX, y: centerY },
          (orientation * Math.PI * 2) / 3
        );

        for (let laneIndex = 0; laneIndex < offsets.length; laneIndex += 1) {
          const lane = offsetPolyline(motif, offsets[laneIndex]!);
          const clipped = clipPolylineToBounds(lane, bounds);
          if (clipped.length === 0) {
            continue;
          }

          const target =
            positiveMod(row + col + laneIndex, 4) === 0 ? accentPaths : primaryPaths;
          target.push(...clipped);
        }
      }
    }

    return {
      canvas,
      layers: [
        {
          id: "ribbons-dark",
          label: "Dark Ribbons",
          stroke: ribbonPalette.dark,
          paths: primaryPaths,
        },
        {
          id: "ribbons-light",
          label: "Light Ribbons",
          stroke: ribbonPalette.light,
          paths: accentPaths,
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "pattern-bounds",
              label: "Pattern Bounds",
              stroke: plotPalette.mask,
              paths: debugPaths,
            },
          ]
        : undefined,
      metadata: {
        programId: "isometric-ribbons",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
