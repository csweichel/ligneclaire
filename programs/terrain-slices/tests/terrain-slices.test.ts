import {
  calculateDocumentMetrics,
  contentBounds,
  generateTerrainSliceGeometry,
  plotPalette,
  type Polyline,
} from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender } from "../../test-helpers";
import { program } from "../index";
import defaultSet from "../params/default.json";

function pathBounds(paths: readonly Polyline[]) {
  const points = paths.flatMap((path) => path.points);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

describe("terrain-slices program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: true,
    });
    const metrics = calculateDocumentMetrics(document);

    expect(metrics.artLayerCount).toBe(2);
    expect(metrics.debugLayerCount).toBe(1);
    expect(document.layers[0]?.stroke).toBe(plotPalette.water);
    expect(document.layers[1]?.stroke).toBe(plotPalette.primary);
    expect(document.layers[0]?.paths.length ?? 0).toBeGreaterThan(80);
    expect(document.layers[1]?.paths.length ?? 0).toBeGreaterThan(40);
  });

  it("keeps all generated geometry inside the printable content bounds", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: false,
    });
    const bounds = contentBounds(document.canvas);
    const points = document.layers.flatMap((layer) =>
      layer.paths.flatMap((path) => path.points)
    );
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(bounds.maxX + 1e-6);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(bounds.minY - 1e-6);
    expect(Math.max(...ys)).toBeLessThanOrEqual(bounds.maxY + 1e-6);
  });

  it("emits one plane outline and one terrain footprint guide", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: true,
    });
    const guides = document.debugLayers?.[0]?.paths ?? [];

    expect(guides).toHaveLength(2);
    expect(guides[0]?.closed).toBe(true);
    expect(guides[1]?.closed).toBe(true);
  });

  it("keeps mountain size stable when the plane size changes", () => {
    const common = {
      center: { x: 0, y: 0 },
      seed: defaultSet.params.seed,
      terrainOffsetX: defaultSet.params.terrainOffsetX,
      terrainOffsetY: defaultSet.params.terrainOffsetY,
      mountainScale: defaultSet.params.mountainScale,
      height: defaultSet.params.height,
      waterLevel: defaultSet.params.waterLevel,
      contourLevels: defaultSet.params.contourLevels,
      hatchSpacing: defaultSet.params.hatchSpacing,
      roughness: defaultSet.params.roughness,
      waterSpacing: defaultSet.params.waterSpacing,
    };
    const smallPlane = generateTerrainSliceGeometry({
      ...common,
      planeWidth: 74,
      planeDepth: 74 * 0.86,
    });
    const largePlane = generateTerrainSliceGeometry({
      ...common,
      planeWidth: 112,
      planeDepth: 112 * 0.86,
    });
    const smallTerrainBounds = pathBounds(smallPlane.aboveWaterTerrainPaths);
    const largeTerrainBounds = pathBounds(largePlane.aboveWaterTerrainPaths);

    expect(Math.abs(smallTerrainBounds.minX - largeTerrainBounds.minX)).toBeLessThan(0.01);
    expect(Math.abs(smallTerrainBounds.maxX - largeTerrainBounds.maxX)).toBeLessThan(0.01);
    expect(Math.abs(smallTerrainBounds.minY - largeTerrainBounds.minY)).toBeLessThan(0.01);
    expect(Math.abs(smallTerrainBounds.maxY - largeTerrainBounds.maxY)).toBeLessThan(0.01);
  });

  it("renders only the visible terrain above the water plane", () => {
    const geometry = generateTerrainSliceGeometry({
      center: { x: 0, y: 0 },
      seed: defaultSet.params.seed,
      planeWidth: defaultSet.params.planeSize,
      planeDepth: defaultSet.params.planeSize * 0.86,
      mountainScale: defaultSet.params.mountainScale,
      height: defaultSet.params.height,
      waterLevel: defaultSet.params.waterLevel,
      contourLevels: defaultSet.params.contourLevels,
      hatchSpacing: defaultSet.params.hatchSpacing,
      roughness: defaultSet.params.roughness,
      waterSpacing: defaultSet.params.waterSpacing,
    });
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: false,
    });

    expect(geometry.belowWaterTerrainPaths.length).toBe(0);
    expect(document.layers[1]?.paths.length).toBe(geometry.aboveWaterTerrainPaths.length);
    expect(geometry.contourPaths).toHaveLength(0);
    expect(document.layers[1]?.paths.length ?? 0).toBeGreaterThan(0);
  });

  it("moves the terrain across the plane without moving the water surface", () => {
    const common = {
      center: { x: 0, y: 0 },
      seed: defaultSet.params.seed,
      planeWidth: defaultSet.params.planeSize,
      planeDepth: defaultSet.params.planeSize * 0.86,
      mountainScale: defaultSet.params.mountainScale,
      height: defaultSet.params.height,
      waterLevel: defaultSet.params.waterLevel,
      contourLevels: defaultSet.params.contourLevels,
      hatchSpacing: defaultSet.params.hatchSpacing,
      roughness: defaultSet.params.roughness,
      waterSpacing: defaultSet.params.waterSpacing,
    };
    const centered = generateTerrainSliceGeometry({
      ...common,
      terrainOffsetX: 0,
      terrainOffsetY: 0,
    });
    const shifted = generateTerrainSliceGeometry({
      ...common,
      terrainOffsetX: 14,
      terrainOffsetY: -10,
    });
    const centeredPlaneBounds = pathBounds([centered.planeOutline]);
    const shiftedPlaneBounds = pathBounds([shifted.planeOutline]);
    const centeredTerrainBounds = pathBounds(centered.aboveWaterTerrainPaths);
    const shiftedTerrainBounds = pathBounds(shifted.aboveWaterTerrainPaths);

    expect(Math.abs(centeredPlaneBounds.minX - shiftedPlaneBounds.minX)).toBeLessThan(1e-6);
    expect(Math.abs(centeredPlaneBounds.maxX - shiftedPlaneBounds.maxX)).toBeLessThan(1e-6);
    expect(Math.abs(centeredPlaneBounds.minY - shiftedPlaneBounds.minY)).toBeLessThan(1e-6);
    expect(Math.abs(centeredPlaneBounds.maxY - shiftedPlaneBounds.maxY)).toBeLessThan(1e-6);
    expect(Math.abs(centeredTerrainBounds.minX - shiftedTerrainBounds.minX)).toBeGreaterThan(1);
    expect(Math.abs(centeredTerrainBounds.minY - shiftedTerrainBounds.minY)).toBeGreaterThan(1);
  });
});
