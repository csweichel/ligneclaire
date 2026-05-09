import { describe, expect, it } from "vitest";
import { generateVoronoiNestedCells } from "./voronoi";

const bounds = {
  minX: 10,
  minY: 20,
  maxX: 160,
  maxY: 240,
} as const;

describe("generateVoronoiNestedCells", () => {
  it("builds deterministic clipped Voronoi cells and nested transformed copies", () => {
    const first = generateVoronoiNestedCells(bounds, {
      pointCount: 12,
      seed: 20,
      filletRadius: 18,
      layerCount: 4,
      scaleBase: 0.9,
      rotationStep: 0.6,
    });
    const second = generateVoronoiNestedCells(bounds, {
      pointCount: 12,
      seed: 20,
      filletRadius: 18,
      layerCount: 4,
      scaleBase: 0.9,
      rotationStep: 0.6,
    });

    expect(first.seedPoints).toEqual(second.seedPoints);
    expect(first.cells).toEqual(second.cells);
    expect(first.roundedCells).toEqual(second.roundedCells);
    expect(first.paths).toEqual(second.paths);
    expect(first.seedPoints).toHaveLength(12);
    expect(first.cells).toHaveLength(12);
    expect(first.roundedCells).toHaveLength(12);
    expect(first.centroids).toHaveLength(12);
    expect(first.paths).toHaveLength(48);
  });

  it("keeps raw Voronoi cells clipped to the requested rectangular boundary", () => {
    const result = generateVoronoiNestedCells(bounds, {
      pointCount: 18,
      seed: 42,
      filletRadius: 12,
      layerCount: 3,
      scaleBase: 0.85,
      rotationStep: 0.35,
    });

    expect(
      result.cells.every((cell) =>
        cell.every(
          (point) =>
            point.x >= bounds.minX - 1e-6 &&
            point.x <= bounds.maxX + 1e-6 &&
            point.y >= bounds.minY - 1e-6 &&
            point.y <= bounds.maxY + 1e-6
        )
      )
    ).toBe(true);
  });

  it("adds rounded corner samples while keeping every output path closed", () => {
    const result = generateVoronoiNestedCells(bounds, {
      pointCount: 10,
      seed: 7,
      filletRadius: 20,
      layerCount: 2,
      scaleBase: 0.9,
      rotationStep: 0.25,
    });

    expect(
      result.roundedCells.some(
        (cell, index) => cell.points.length > result.cells[index]!.length
      )
    ).toBe(true);
    expect(result.paths.every((path) => path.closed === true)).toBe(true);
    expect(result.paths.every((path) => path.points.length >= 3)).toBe(true);
  });
});
