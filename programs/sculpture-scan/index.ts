import {
  clamp,
  clipPolylineToBounds,
  contentBounds,
  createFractalNoise2D,
  createRng,
  deformPolyline,
  defineProgram,
  floatParam,
  intParam,
  lerp,
  plotPalette,
  sampleFunctionPath,
  type Bounds,
  type NormalizedParams,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const sculptureScanParamSchema = {
  seed: intParam({
    min: 1,
    max: 999999,
    default: 2417,
    label: "Seed",
    group: "Surface",
  }),
  lineSpacing: floatParam({
    min: 0.6,
    max: 4,
    default: 0.9,
    step: 0.05,
    label: "Line Spacing",
    group: "Scan",
    unit: "mm",
  }),
  sampleStep: floatParam({
    min: 0.4,
    max: 4,
    default: 0.9,
    step: 0.05,
    label: "Sample Step",
    group: "Scan",
    unit: "mm",
  }),
  relief: floatParam({
    min: 0,
    max: 18,
    default: 13.5,
    step: 0.1,
    label: "Relief",
    group: "Surface",
    unit: "mm",
  }),
  features: intParam({
    min: 2,
    max: 24,
    default: 12,
    label: "Masses",
    group: "Surface",
  }),
  featureRadius: floatParam({
    min: 8,
    max: 60,
    default: 18,
    step: 0.5,
    label: "Mass Radius",
    group: "Surface",
    unit: "mm",
  }),
  stretch: floatParam({
    min: 1,
    max: 6,
    default: 3.2,
    step: 0.1,
    label: "Vertical Stretch",
    group: "Surface",
  }),
  detail: floatParam({
    min: 0,
    max: 1,
    default: 0.6,
    step: 0.01,
    label: "Micro Relief",
    group: "Surface",
  }),
  warp: floatParam({
    min: 0,
    max: 1,
    default: 0.26,
    step: 0.01,
    label: "Turbulence",
    group: "Surface",
  }),
} as const;

type SculptureScanParams = NormalizedParams<typeof sculptureScanParamSchema>;

type SurfaceMass = Readonly<{
  center: Point;
  radiusX: number;
  radiusY: number;
  strength: number;
}>;

function reversePolyline(polyline: Polyline): Polyline {
  return {
    ...polyline,
    points: [...polyline.points].reverse(),
  };
}

function makeEllipse(center: Point, radiusX: number, radiusY: number, segments = 72): Polyline {
  return sampleFunctionPath(
    (t) => {
      const angle = t * Math.PI * 2;
      return {
        x: center.x + Math.cos(angle) * radiusX,
        y: center.y + Math.sin(angle) * radiusY,
      };
    },
    0,
    1,
    segments
  );
}

function createSurfaceMasses(bounds: Bounds, params: SculptureScanParams): readonly SurfaceMass[] {
  const rng = createRng(params.seed * 101 + 7);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  return Array.from({ length: params.features }, (_, index) => {
    const radiusX = Math.min(params.featureRadius * rng.float(0.65, 1.2), width * 0.18);
    const radiusY = Math.min(radiusX * params.stretch * rng.float(0.9, 1.35), height * 0.3);
    const minX = bounds.minX + radiusX;
    const maxX = bounds.maxX - radiusX;
    const minY = bounds.minY + radiusY;
    const maxY = bounds.maxY - radiusY;

    return {
      center: {
        x: rng.float(minX, maxX),
        y: rng.float(minY, maxY),
      },
      radiusX,
      radiusY,
      strength: rng.float(0.8, 1.3) * (index % 4 === 0 ? 1.08 : 1),
    };
  });
}

function createDetailMasses(
  bounds: Bounds,
  params: SculptureScanParams,
  masses: readonly SurfaceMass[]
): readonly SurfaceMass[] {
  const rng = createRng(params.seed * 313 + 17);
  const detailMasses: SurfaceMass[] = [];

  for (const mass of masses) {
    const count = 1 + Math.floor(rng.float(0, 2.999));

    for (let index = 0; index < count; index += 1) {
      const radiusX = Math.max(4, mass.radiusX * rng.float(0.22, 0.48));
      const radiusY = Math.max(8, mass.radiusY * rng.float(0.22, 0.5));
      const center = {
        x: clamp(
          mass.center.x + rng.float(-mass.radiusX * 0.55, mass.radiusX * 0.55),
          bounds.minX + radiusX,
          bounds.maxX - radiusX
        ),
        y: clamp(
          mass.center.y + rng.float(-mass.radiusY * 0.55, mass.radiusY * 0.55),
          bounds.minY + radiusY,
          bounds.maxY - radiusY
        ),
      };

      detailMasses.push({
        center,
        radiusX,
        radiusY,
        strength: mass.strength * params.detail * rng.float(0.4, 0.8),
      });
    }
  }

  return detailMasses;
}

function createSurfaceDisplacementField(
  bounds: Bounds,
  params: SculptureScanParams,
  masses: readonly SurfaceMass[]
): (point: Point) => number {
  const detailMasses = createDetailMasses(bounds, params, masses);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const domainWarp = createFractalNoise2D(params.seed * 17 + 23, {
    octaves: 3,
    persistence: 0.58,
    lacunarity: 2.1,
  });
  const wrinkleNoise = createFractalNoise2D(params.seed * 29 + 11, {
    octaves: 3,
    persistence: 0.58,
    lacunarity: 2.5,
  });
  const primaryScale = masses.length > 0 ? 1 / Math.max(1, Math.sqrt(masses.length) * 0.68) : 1;
  const detailScale =
    detailMasses.length > 0 ? 1 / Math.max(1, Math.sqrt(detailMasses.length) * 0.85) : 1;

  return (point) => {
    const normalizedX = (point.x - bounds.minX) / width;
    const normalizedY = (point.y - bounds.minY) / height;
    const warpX =
      domainWarp(normalizedX * 1.35 + 8.1, normalizedY * 0.75 - 3.7) *
      params.warp *
      params.featureRadius *
      0.5;
    const warpY =
      domainWarp(normalizedX * 0.8 - 6.4, normalizedY * 1.2 + 4.9) *
      params.warp *
      params.featureRadius *
      0.28;
    const samplePoint = {
      x: point.x + warpX,
      y: point.y + warpY,
    };

    let primary = 0;
    for (const mass of masses) {
      const dx = (samplePoint.x - mass.center.x) / Math.max(mass.radiusX, 1e-6);
      const dy = (samplePoint.y - mass.center.y) / Math.max(mass.radiusY, 1e-6);
      const envelope = Math.exp(-0.5 * (dx * dx + dy * dy));

      primary += dx * envelope * mass.strength * 1.35;
    }

    let detail = 0;
    for (const mass of detailMasses) {
      const dx = (samplePoint.x - mass.center.x) / Math.max(mass.radiusX, 1e-6);
      const dy = (samplePoint.y - mass.center.y) / Math.max(mass.radiusY, 1e-6);
      const envelope = Math.exp(-0.5 * (dx * dx + dy * dy));

      detail += dx * envelope * mass.strength * 1.8;
    }

    const wrinkle =
      wrinkleNoise(normalizedX * 5.2 + 12.1, normalizedY * 5.8 - 7.3) * params.warp * 0.35;

    return clamp(primary * primaryScale + detail * detailScale + wrinkle, -1.9, 1.9);
  };
}

function buildScanPaths(
  bounds: Bounds,
  params: SculptureScanParams
): Readonly<{
  paths: readonly Polyline[];
  masses: readonly SurfaceMass[];
}> {
  const masses = createSurfaceMasses(bounds, params);
  const displacement = createSurfaceDisplacementField(bounds, params, masses);
  const width = bounds.maxX - bounds.minX;
  const lineCount = Math.max(2, Math.floor(width / params.lineSpacing) + 1);
  const paths: Polyline[] = [];

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const x = lerp(bounds.minX, bounds.maxX, lineIndex / (lineCount - 1));
    const deformed = deformPolyline(
      {
        points: [
          { x, y: bounds.minY },
          { x, y: bounds.maxY },
        ],
      },
      {
        mode: "direction",
        direction: { x: 1, y: 0 },
        segmentLength: params.sampleStep,
        amount: ({ point }) => params.relief * displacement(point),
      }
    );
    const clipped = clipPolylineToBounds(deformed, bounds);
    const ordered =
      lineIndex % 2 === 0 ? clipped : [...clipped].reverse().map((path) => reversePolyline(path));

    paths.push(...ordered);
  }

  return {
    paths,
    masses,
  };
}

export const program = defineProgram({
  id: "sculpture-scan",
  title: "Sculpture Scan",
  description: "Vertical scan lines laterally displaced by a smooth sculpting field to suggest a carved surface.",
  version: "1.0.0",
  canvas,
  params: sculptureScanParamSchema,
  validation: {
    cases: ["default"],
    budgets: {
      maxRenderMs: 350,
      maxArtLayers: 1,
      maxPaths: 320,
      maxSegments: 90000,
      maxDrawDistanceMm: 95000,
      maxPenUpDistanceMm: 9000,
    },
  },
  render(ctx) {
    const bounds = contentBounds(canvas);
    const { paths, masses } = buildScanPaths(bounds, ctx.params);

    return {
      canvas,
      layers: [
        {
          id: "sculpture-scan",
          label: "Sculpture Scan",
          stroke: plotPalette.primary,
          paths,
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "surface-masses",
              label: "Surface Masses",
              stroke: plotPalette.mask,
              paths: masses.map((mass) => makeEllipse(mass.center, mass.radiusX, mass.radiusY)),
            },
          ]
        : undefined,
      metadata: {
        programId: "sculpture-scan",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
