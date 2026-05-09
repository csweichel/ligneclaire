import { describe, expect, it } from "vitest";
import { generateHamiltonPaths } from "./hamilton";

function pointKey(x: number, y: number): string {
  return `${x.toFixed(6)},${y.toFixed(6)}`;
}

function samePolylinePoints(left: readonly { x: number; y: number }[], right: readonly { x: number; y: number }[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (point, index) =>
      Math.abs(point.x - right[index]!.x) < 1e-6 &&
      Math.abs(point.y - right[index]!.y) < 1e-6
  );
}

describe("generateHamiltonPaths", () => {
  it("renders a deterministic Hamiltonian centerline that visits every cell once", () => {
    const bounds = {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 80,
    };
    const first = generateHamiltonPaths(bounds, {
      rows: 4,
      cols: 5,
      seed: 17,
      mixSteps: 512,
    });
    const second = generateHamiltonPaths(bounds, {
      rows: 4,
      cols: 5,
      seed: 17,
      mixSteps: 512,
    });

    expect(first.centerline.points).toEqual(second.centerline.points);
    expect(first.baseNodes).toEqual(second.baseNodes);
    expect(first.centerline.points).toHaveLength(20);
    expect(first.baseNodes).toHaveLength(20);
    expect(
      new Set(first.centerline.points.map((point) => pointKey(point.x, point.y))).size
    ).toBe(20);
  });

  it("supports oblique lattices while preserving the full node count", () => {
    const result = generateHamiltonPaths(
      {
        minX: 0,
        minY: 0,
        maxX: 140,
        maxY: 100,
      },
      {
        rows: 4,
        cols: 6,
        seed: 91,
        mixSteps: 320,
        gridRotationDeg: 12,
        latticeAngleDeg: 60,
        rowStepRatio: 1,
      }
    );

    expect(result.baseNodes).toHaveLength(24);
    expect(
      result.centerline.points.slice(1).some((point, index) => {
        const previous = result.centerline.points[index]!;
        return (
          Math.abs(point.x - previous.x) > 1e-6 &&
          Math.abs(point.y - previous.y) > 1e-6
        );
      })
    ).toBe(true);
  });

  it("draws one fewer line when rendering centerlines between strokes", () => {
    const bounds = {
      minX: 0,
      minY: 0,
      maxX: 120,
      maxY: 90,
    };
    const boundaryStrokes = generateHamiltonPaths(bounds, {
      rows: 3,
      cols: 4,
      seed: 23,
      mixSteps: 192,
      strokeCount: 3,
      strokeSpacing: 2,
      drawCenterlines: false,
    });
    const centerlineStrokes = generateHamiltonPaths(bounds, {
      rows: 3,
      cols: 4,
      seed: 23,
      mixSteps: 192,
      strokeCount: 3,
      strokeSpacing: 2,
      drawCenterlines: true,
    });

    expect(boundaryStrokes.paths).toHaveLength(3);
    expect(centerlineStrokes.paths).toHaveLength(2);
    expect(
      boundaryStrokes.paths.some((path) =>
        samePolylinePoints(path.points, boundaryStrokes.centerline.points)
      )
    ).toBe(true);
    expect(
      centerlineStrokes.paths.some((path) =>
        samePolylinePoints(path.points, centerlineStrokes.centerline.points)
      )
    ).toBe(false);
  });

  it("keeps unrounded zero-deflection strokes on horizontal or vertical runs", () => {
    const result = generateHamiltonPaths(
      {
        minX: 0,
        minY: 0,
        maxX: 140,
        maxY: 100,
      },
      {
        rows: 4,
        cols: 6,
        seed: 91,
        mixSteps: 320,
        strokeCount: 3,
        strokeSpacing: 2,
        deflection: 0,
        cornerRadius: 0,
      }
    );

    expect(
      result.paths.every((path) =>
        path.points.slice(1).every((point, index) => {
          const previous = path.points[index]!;
          return (
            Math.abs(point.x - previous.x) < 1e-6 ||
            Math.abs(point.y - previous.y) < 1e-6
          );
        })
      )
    ).toBe(true);
  });

  it("adds interpolated corner points when rounding is enabled", () => {
    const straight = generateHamiltonPaths(
      {
        minX: 0,
        minY: 0,
        maxX: 120,
        maxY: 90,
      },
      {
        rows: 3,
        cols: 4,
        seed: 23,
        mixSteps: 192,
        strokeCount: 1,
        cornerRadius: 0,
      }
    );
    const rounded = generateHamiltonPaths(
      {
        minX: 0,
        minY: 0,
        maxX: 120,
        maxY: 90,
      },
      {
        rows: 3,
        cols: 4,
        seed: 23,
        mixSteps: 192,
        strokeCount: 1,
        cornerRadius: 1.25,
      }
    );

    expect(rounded.paths[0]!.points.length).toBeGreaterThan(
      straight.paths[0]!.points.length
    );
  });

  it("adjusts the rounded corner radius per lane offset", () => {
    const result = generateHamiltonPaths(
      {
        minX: 0,
        minY: 0,
        maxX: 120,
        maxY: 120,
      },
      {
        rows: 2,
        cols: 2,
        seed: 5,
        mixSteps: 0,
        strokeCount: 3,
        strokeSpacing: 2,
        cornerRadius: 4,
      }
    );

    expect(result.paths).toHaveLength(3);
    expect(result.paths[0]!.points.length).toBeGreaterThan(result.paths[1]!.points.length);
    expect(result.paths[1]!.points.length).toBeGreaterThan(result.paths[2]!.points.length);
  });
});
