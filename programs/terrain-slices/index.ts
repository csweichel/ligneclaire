import {
  contentBounds,
  defineProgram,
  floatParam,
  generateTerrainSliceGeometry,
  intParam,
  plotPalette,
  type Bounds,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 297,
  heightMm: 420,
  marginMm: 12,
} as const;

export const terrainSlicesParamSchema = {
  seed: intParam({
    min: 1,
    max: 999999,
    default: 2812,
    label: "Seed",
    group: "Terrain",
  }),
  contourLevels: intParam({
    min: 4,
    max: 24,
    default: 12,
    label: "Contour Levels",
    group: "Terrain",
  }),
  planeSize: floatParam({
    min: 48,
    max: 120,
    default: 74,
    step: 1,
    label: "Plane Size",
    group: "Layout",
    unit: "mm",
  }),
  terrainOffsetX: floatParam({
    min: -48,
    max: 48,
    default: 0,
    step: 0.5,
    label: "Terrain X",
    group: "Layout",
    unit: "mm",
  }),
  terrainOffsetY: floatParam({
    min: -48,
    max: 48,
    default: 0,
    step: 0.5,
    label: "Terrain Y",
    group: "Layout",
    unit: "mm",
  }),
  mountainScale: floatParam({
    min: 0.35,
    max: 0.95,
    default: 0.9,
    step: 0.01,
    label: "Mountain Scale",
    group: "Terrain",
  }),
  height: floatParam({
    min: 8,
    max: 72,
    default: 28,
    step: 0.5,
    label: "Height",
    group: "Terrain",
    unit: "mm",
  }),
  roughness: floatParam({
    min: 0,
    max: 1,
    default: 0.62,
    step: 0.01,
    label: "Roughness",
    group: "Terrain",
  }),
  waterLevel: floatParam({
    min: 0,
    max: 1,
    default: 0.42,
    step: 0.01,
    label: "Water Level",
    group: "Water",
  }),
  hatchSpacing: floatParam({
    min: 0.3,
    max: 2.5,
    default: 0.88,
    step: 0.02,
    label: "Terrain Hatch",
    group: "Stroke",
    unit: "mm",
  }),
  waterSpacing: floatParam({
    min: 0.2,
    max: 2,
    default: 0.62,
    step: 0.02,
    label: "Water Hatch",
    group: "Stroke",
    unit: "mm",
  }),
} as const;

function translatePolyline(polyline: Polyline, delta: Point): Polyline {
  return {
    ...polyline,
    points: polyline.points.map((point) => ({
      x: point.x + delta.x,
      y: point.y + delta.y,
    })),
  };
}

function pathsBounds(paths: readonly Polyline[]): Bounds {
  const points = paths.flatMap((path) => path.points);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function boundsCenter(bounds: Bounds): Point {
  return {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };
}

export const program = defineProgram({
  id: "terrain-slices",
  title: "Terrain Slice",
  description:
    "A single isometric terrain slice with lifted linework rising through a water plane.",
  version: "1.0.0",
  canvas,
  params: terrainSlicesParamSchema,
  validation: {
    cases: ["default"],
    budgets: {
      maxRenderMs: 300,
      maxArtLayers: 2,
      maxPaths: 7000,
      maxSegments: 260000,
      maxDrawDistanceMm: 700000,
      maxPenUpDistanceMm: 65000,
    },
  },
  render(ctx) {
    const bounds = contentBounds(canvas);
    const planeDepth = ctx.params.planeSize * 0.86;
    const geometry = generateTerrainSliceGeometry({
      center: { x: 0, y: 0 },
      seed: ctx.params.seed,
      planeWidth: ctx.params.planeSize,
      planeDepth,
      terrainOffsetX: ctx.params.terrainOffsetX,
      terrainOffsetY: ctx.params.terrainOffsetY,
      mountainScale: ctx.params.mountainScale,
      height: ctx.params.height,
      waterLevel: ctx.params.waterLevel,
      contourLevels: ctx.params.contourLevels,
      hatchSpacing: ctx.params.hatchSpacing,
      roughness: ctx.params.roughness,
      waterSpacing: ctx.params.waterSpacing,
    });
    const panelBounds = pathsBounds([
      ...geometry.aboveWaterTerrainPaths,
      ...geometry.waterPaths,
      geometry.planeOutline,
    ]);
    const delta = {
      x: (bounds.minX + bounds.maxX) * 0.5 - boundsCenter(panelBounds).x,
      y: (bounds.minY + bounds.maxY) * 0.5 - boundsCenter(panelBounds).y,
    };
    const aboveWaterTerrainPaths = geometry.aboveWaterTerrainPaths.map((path) =>
      translatePolyline(path, delta)
    );
    const waterPaths = geometry.waterPaths.map((path) => translatePolyline(path, delta));
    const debugPaths = [
      translatePolyline(geometry.planeOutline, delta),
      translatePolyline(geometry.baseOutline, delta),
    ];

    return {
      canvas,
      layers: [
        {
          id: "water-plane",
          label: "Water Plane",
          stroke: plotPalette.water,
          paths: waterPaths,
        },
        {
          id: "terrain-above-water",
          label: "Terrain Above Water",
          stroke: plotPalette.primary,
          paths: aboveWaterTerrainPaths,
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "terrain-guides",
              label: "Terrain Guides",
              stroke: plotPalette.mask,
              paths: debugPaths,
            },
          ]
        : undefined,
      metadata: {
        programId: "terrain-slices",
        version: "1.0.0",
        mode: ctx.mode,
        contourLevels: String(ctx.params.contourLevels),
        waterLevel: ctx.params.waterLevel.toFixed(2),
        terrainOffsetX: ctx.params.terrainOffsetX.toFixed(1),
        terrainOffsetY: ctx.params.terrainOffsetY.toFixed(1),
        terrainPathCount: String(aboveWaterTerrainPaths.length),
      },
    };
  },
});
