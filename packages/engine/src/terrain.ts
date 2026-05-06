import {
  clipPolylineToPolygon,
  excludePolylineFromPolygon,
  type Polygon,
} from "./clip";
import type { Bounds, Point, Polyline } from "./document";
import { clamp, hatchBounds } from "./geometry";
import { createFractalNoise2D } from "./noise";
import { createRng } from "./rng";

type Point3 = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type TerrainSliceSpec = Readonly<{
  center: Point;
  seed: number;
  planeWidth: number;
  planeDepth: number;
  terrainOffsetX?: number;
  terrainOffsetY?: number;
  mountainScale: number;
  height: number;
  waterLevel: number;
  contourLevels: number;
  contourSamples?: number;
  hatchSpacing: number;
  roughness?: number;
  terrainAngleDeg?: number;
  waterSpacing?: number;
  waterAngleDeg?: number;
}>;

export type TerrainSliceGeometry = Readonly<{
  terrainFillPaths: readonly Polyline[];
  contourPaths: readonly Polyline[];
  belowWaterTerrainPaths: readonly Polyline[];
  aboveWaterTerrainPaths: readonly Polyline[];
  waterPaths: readonly Polyline[];
  planeOutline: Polyline;
  baseOutline: Polyline;
}>;

const FULL_TURN = Math.PI * 2;
const ISO_X = Math.cos(Math.PI / 6);
const ISO_Y = 0.5;
const DEFAULT_WATER_ANGLE_DEG = 18;
const VERTICAL_EXAGGERATION = 2.75;
const BASE_MOUNTAIN_WIDTH_MM = 74;
const BASE_MOUNTAIN_DEPTH_MM = 64;
const LEVEL_EPSILON = 1e-6;
const FOOTPRINT_OUTLINE_SAMPLES = 80;

function polygonToPolyline(polygon: Polygon): Polyline {
  return {
    points: [...polygon],
    closed: true,
  };
}

function polygonBounds(polygon: Polygon): Bounds {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function terrainFootprint(spec: TerrainSliceSpec): Readonly<{
  width: number;
  depth: number;
}> {
  const scale = clamp(spec.mountainScale, 0.2, 0.95);

  return {
    width: BASE_MOUNTAIN_WIDTH_MM * scale,
    depth: BASE_MOUNTAIN_DEPTH_MM * scale,
  };
}

function normalizedWaterLevel(spec: TerrainSliceSpec): number {
  return clamp(spec.waterLevel, 0, 1);
}

function projectPoint(point: Point3, center: Point): Point {
  return {
    x: center.x + (point.x - point.y) * ISO_X,
    y: center.y - (point.x + point.y) * ISO_Y + point.z * VERTICAL_EXAGGERATION,
  };
}

function createPlanePolygon(spec: TerrainSliceSpec): Polygon {
  const halfWidth = spec.planeWidth * 0.5;
  const halfDepth = spec.planeDepth * 0.5;
  const waterHeight = normalizedWaterLevel(spec) * spec.height;

  return [
    { x: -halfWidth, y: -halfDepth, z: waterHeight },
    { x: halfWidth, y: -halfDepth, z: waterHeight },
    { x: halfWidth, y: halfDepth, z: waterHeight },
    { x: -halfWidth, y: halfDepth, z: waterHeight },
  ].map((point) => projectPoint(point, spec.center));
}

function hatchPolygon(polygon: Polygon, spacing: number, angleDeg: number): readonly Polyline[] {
  const bounds = polygonBounds(polygon);

  return hatchBounds(bounds, Math.max(0.15, spacing), angleDeg).flatMap((line) =>
    clipPolylineToPolygon(line, polygon)
  );
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

type TerrainHeightfield = Readonly<{
  footprint: Readonly<{
    width: number;
    depth: number;
  }>;
  centerX: number;
  centerY: number;
  heightAt: (x: number, y: number) => number;
}>;

function createTerrainHeightfield(spec: TerrainSliceSpec): TerrainHeightfield {
  const roughness = clamp(spec.roughness ?? 0.58, 0, 1);
  const footprint = terrainFootprint(spec);
  const rng = createRng(spec.seed);
  const levels = Math.max(4, Math.floor(spec.contourLevels));
  const preferredPeakAngle = Math.PI / 4 + rng.float(-0.18, 0.18);
  const broadNoise = createFractalNoise2D(spec.seed * 17 + 11, {
    octaves: 4,
    persistence: 0.57,
    lacunarity: 2,
  });
  const detailNoise = createFractalNoise2D(spec.seed * 31 + 7, {
    octaves: 3,
    persistence: 0.5,
    lacunarity: 2.35,
  });
  const broadScale = rng.float(0.75, 1.15);
  const detailScale = rng.float(1.8, 3.3);
  const ridgeFrequency = rng.float(2.2, 4.4);
  const ridgePhase = rng.float(0, FULL_TURN);
  const crossPeakAngle = preferredPeakAngle + Math.PI * 0.5;
  const terrainOffsetX = spec.terrainOffsetX ?? 0;
  const terrainOffsetY = spec.terrainOffsetY ?? 0;
  const centerX =
    terrainOffsetX +
    Math.cos(preferredPeakAngle) * footprint.width * rng.float(0.12, 0.22) +
    Math.cos(crossPeakAngle) * footprint.width * rng.float(-0.05, 0.05);
  const centerY =
    terrainOffsetY +
    Math.sin(preferredPeakAngle) * footprint.depth * rng.float(0.16, 0.28) +
    Math.sin(crossPeakAngle) * footprint.depth * rng.float(-0.04, 0.04);
  const radiusX = footprint.width * 0.5;
  const radiusY = footprint.depth * 0.42;
  const terraceSharpness = 1.12 + levels * 0.03;

  return {
    footprint,
    centerX,
    centerY,
    heightAt(x, y) {
      const normalizedX = (x - centerX) / radiusX;
      const normalizedY = (y - centerY) / radiusY;
      const radial = Math.hypot(normalizedX, normalizedY);

      if (radial >= 1.18) {
        return 0;
      }

      const broad = broadNoise(
        normalizedX * broadScale + 7.1,
        normalizedY * broadScale - 3.4
      );
      const detail = detailNoise(
        normalizedX * detailScale - 4.3,
        normalizedY * detailScale + 2.6
      );
      const ridgeAxis =
        normalizedX * Math.cos(crossPeakAngle) + normalizedY * Math.sin(crossPeakAngle);
      const ridges = Math.cos(ridgeAxis * ridgeFrequency + ridgePhase) * 0.06;
      const directional =
        normalizedX * Math.cos(preferredPeakAngle) +
        normalizedY * Math.sin(preferredPeakAngle);
      const shape = clamp(
        Math.max(0, 1 - Math.pow(radial, terraceSharpness)) +
          broad * 0.18 * roughness +
          detail * 0.08 * roughness +
          ridges * roughness +
          directional * 0.06,
        0,
        1
      );

      return shape * spec.height;
    },
  };
}

function createFootprintPolygon(
  spec: TerrainSliceSpec,
  heightfield: TerrainHeightfield
): Polygon {
  const waterHeight = normalizedWaterLevel(spec) * spec.height;
  const radiusX = heightfield.footprint.width * 0.5;
  const radiusY = heightfield.footprint.depth * 0.42;

  return Array.from({ length: FOOTPRINT_OUTLINE_SAMPLES }, (_, index) => {
    const angle = (index / FOOTPRINT_OUTLINE_SAMPLES) * FULL_TURN;

    return projectPoint(
      {
        x: heightfield.centerX + Math.cos(angle) * radiusX,
        y: heightfield.centerY + Math.sin(angle) * radiusY,
        z: waterHeight,
      },
      spec.center
    );
  });
}

function createTerrainOcclusionPolygon(
  spec: TerrainSliceSpec,
  heightfield: TerrainHeightfield
): Polygon | null {
  const waterHeight = normalizedWaterLevel(spec) * spec.height;
  const peakHeight = heightfield.heightAt(heightfield.centerX, heightfield.centerY);

  if (peakHeight <= waterHeight + LEVEL_EPSILON) {
    return null;
  }

  const sliceSpacing = Math.max(0.2, spec.hatchSpacing * 0.75);
  const sampleStep = Math.max(0.3, sliceSpacing * 0.6);
  const halfWidth = heightfield.footprint.width * 0.62;
  const halfDepth = heightfield.footprint.depth * 0.6;
  const margin = Math.max(4, sliceSpacing * 3.5);
  const minX = -halfWidth - margin;
  const maxX = halfWidth + margin;
  const minY = -halfDepth - margin;
  const maxY = halfDepth + margin;
  const columns: Array<Readonly<{ x: number; topY: number; bottomY: number }>> = [];
  let projectedMinX = Number.POSITIVE_INFINITY;
  let projectedMaxX = Number.NEGATIVE_INFINITY;

  for (let y = minY; y <= maxY + LEVEL_EPSILON; y += sampleStep) {
    for (let x = minX; x <= maxX + LEVEL_EPSILON; x += sampleStep) {
      const height = heightfield.heightAt(x, y);
      if (height <= waterHeight + LEVEL_EPSILON) {
        continue;
      }

      const waterPoint = projectPoint({ x, y, z: waterHeight }, spec.center);
      const terrainPoint = projectPoint({ x, y, z: height }, spec.center);
      const topY = Math.min(waterPoint.y, terrainPoint.y);
      const bottomY = Math.max(waterPoint.y, terrainPoint.y);

      columns.push({
        x: waterPoint.x,
        topY,
        bottomY,
      });
      projectedMinX = Math.min(projectedMinX, waterPoint.x);
      projectedMaxX = Math.max(projectedMaxX, waterPoint.x);
    }
  }

  if (columns.length === 0 || projectedMaxX - projectedMinX <= LEVEL_EPSILON) {
    return null;
  }

  const binCount = Math.max(120, Math.ceil((projectedMaxX - projectedMinX) / 0.35));
  const topEnvelope = Array.from({ length: binCount }, () => Number.POSITIVE_INFINITY);
  const bottomEnvelope = Array.from({ length: binCount }, () => Number.NEGATIVE_INFINITY);
  const hasSample = Array.from({ length: binCount }, () => false);

  for (const column of columns) {
    const amount =
      (column.x - projectedMinX) / Math.max(LEVEL_EPSILON, projectedMaxX - projectedMinX);
    const index = clamp(Math.round(amount * (binCount - 1)), 0, binCount - 1);

    topEnvelope[index] = Math.min(topEnvelope[index]!, column.topY);
    bottomEnvelope[index] = Math.max(bottomEnvelope[index]!, column.bottomY);
    hasSample[index] = true;
  }

  const previousValid = Array.from({ length: binCount }, () => -1);
  const nextValid = Array.from({ length: binCount }, () => -1);
  let lastSeen = -1;
  for (let index = 0; index < binCount; index += 1) {
    if (hasSample[index]) {
      lastSeen = index;
    }
    previousValid[index] = lastSeen;
  }
  lastSeen = -1;
  for (let index = binCount - 1; index >= 0; index -= 1) {
    if (hasSample[index]) {
      lastSeen = index;
    }
    nextValid[index] = lastSeen;
  }

  for (let index = 0; index < binCount; index += 1) {
    if (hasSample[index]) {
      continue;
    }

    const left = previousValid[index]!;
    const right = nextValid[index]!;

    if (left === -1 && right === -1) {
      continue;
    }

    if (left === -1) {
      topEnvelope[index] = topEnvelope[right]!;
      bottomEnvelope[index] = bottomEnvelope[right]!;
      continue;
    }

    if (right === -1) {
      topEnvelope[index] = topEnvelope[left]!;
      bottomEnvelope[index] = bottomEnvelope[left]!;
      continue;
    }

    const amount = (index - left) / Math.max(1, right - left);
    topEnvelope[index] = lerp(topEnvelope[left]!, topEnvelope[right]!, amount);
    bottomEnvelope[index] = lerp(bottomEnvelope[left]!, bottomEnvelope[right]!, amount);
  }

  const upper: Point[] = [];
  const lower: Point[] = [];

  for (let index = 0; index < binCount; index += 1) {
    const x = lerp(projectedMinX, projectedMaxX, index / Math.max(1, binCount - 1));
    upper.push({ x, y: topEnvelope[index]! });
    lower.push({ x, y: bottomEnvelope[index]! });
  }

  return [...upper, ...lower.reverse()];
}

function createTerrainSliceLines(
  spec: TerrainSliceSpec,
  heightfield: TerrainHeightfield
): readonly Polyline[] {
  const waterHeight = normalizedWaterLevel(spec) * spec.height;
  const renderHeight = (height: number) => height;
  const sliceSpacing = Math.max(0.2, spec.hatchSpacing * 0.75);
  const sampleStep = Math.max(0.35, sliceSpacing * 0.9);
  const halfWidth = heightfield.footprint.width * 0.62;
  const halfDepth = heightfield.footprint.depth * 0.6;
  const margin = Math.max(4, sliceSpacing * 3.5);
  const minX = -halfWidth - margin;
  const maxX = halfWidth + margin;
  const minY = -halfDepth - margin;
  const maxY = halfDepth + margin;
  const paths: Polyline[] = [];

  for (let y = minY; y <= maxY + LEVEL_EPSILON; y += sliceSpacing) {
    let previousX = minX;
    let previousHeight = heightfield.heightAt(previousX, y);
    let previousVisible = previousHeight > waterHeight + LEVEL_EPSILON;
    let currentPoints: Point[] = previousVisible
      ? [
          projectPoint(
            {
              x: previousX,
              y,
              z: renderHeight(previousHeight),
            },
            spec.center
          ),
        ]
      : [];

    for (let x = minX + sampleStep; x <= maxX + LEVEL_EPSILON; x += sampleStep) {
      const currentHeight = heightfield.heightAt(x, y);
      const currentVisible = currentHeight > waterHeight + LEVEL_EPSILON;

      if (previousVisible !== currentVisible) {
        const amount =
          Math.abs(currentHeight - previousHeight) <= LEVEL_EPSILON
            ? 0
            : clamp(
                (waterHeight - previousHeight) / (currentHeight - previousHeight),
                0,
                1
              );
        const crossingX = lerp(previousX, x, amount);
        const crossingPoint = projectPoint(
          {
            x: crossingX,
            y,
            z: waterHeight,
          },
          spec.center
        );

        if (previousVisible) {
          currentPoints.push(crossingPoint);
          if (currentPoints.length > 1) {
            paths.push({ points: currentPoints });
          }
          currentPoints = [];
        } else {
          currentPoints = [
            crossingPoint,
            projectPoint(
              {
                x,
                y,
                z: renderHeight(currentHeight),
              },
              spec.center
            ),
          ];
        }
      } else if (currentVisible) {
        currentPoints.push(
          projectPoint(
            {
              x,
              y,
              z: renderHeight(currentHeight),
            },
            spec.center
          )
        );
      } else if (currentPoints.length > 1) {
        paths.push({ points: currentPoints });
        currentPoints = [];
      }

      previousX = x;
      previousHeight = currentHeight;
      previousVisible = currentVisible;
    }

    if (currentPoints.length > 1) {
      paths.push({ points: currentPoints });
    }
  }

  return paths;
}

export function generateTerrainSliceGeometry(spec: TerrainSliceSpec): TerrainSliceGeometry {
  const waterSpacing = Math.max(
    0.2,
    spec.waterSpacing ?? Math.max(0.3, spec.hatchSpacing * 0.72)
  );
  const waterAngleDeg = spec.waterAngleDeg ?? DEFAULT_WATER_ANGLE_DEG;
  const planePolygon = createPlanePolygon(spec);
  const heightfield = createTerrainHeightfield(spec);
  const terrainPaths = createTerrainSliceLines(spec, heightfield);
  const terrainOcclusionPolygon = createTerrainOcclusionPolygon(spec, heightfield);
  const waterPaths = hatchPolygon(planePolygon, waterSpacing, waterAngleDeg).flatMap((path) =>
    terrainOcclusionPolygon
      ? excludePolylineFromPolygon(path, terrainOcclusionPolygon)
      : [path]
  );
  const footprintPolygon = createFootprintPolygon(spec, heightfield);

  return {
    terrainFillPaths: terrainPaths,
    contourPaths: [],
    belowWaterTerrainPaths: [],
    aboveWaterTerrainPaths: terrainPaths,
    waterPaths,
    planeOutline: polygonToPolyline(planePolygon),
    baseOutline: polygonToPolyline(footprintPolygon),
  };
}
