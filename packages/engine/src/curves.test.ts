import { describe, expect, it } from "vitest";
import {
  generateDelaunayPaths,
  generateDragonCurve,
  generateKochCurve,
  generateMooreCurve,
  generatePeanoCurve,
} from "./curves";

const bounds = {
  minX: 10,
  minY: 20,
  maxX: 110,
  maxY: 140,
} as const;

describe("curve generators", () => {
  it("generates the expected Koch segment count per iteration", () => {
    const open = generateKochCurve(2, bounds);
    const snowflake = generateKochCurve(1, bounds, true);

    expect(open.points).toHaveLength(17);
    expect(snowflake.points).toHaveLength(13);
    expect(snowflake.closed).toBe(true);
  });

  it("generates the expected Dragon segment count per iteration", () => {
    const curve = generateDragonCurve(8, bounds);

    expect(curve.points).toHaveLength(257);
  });

  it("keeps Moore and Peano curves inside their target bounds", () => {
    const curves = [generateMooreCurve(3, bounds), generatePeanoCurve(2, bounds)];

    for (const curve of curves) {
      expect(
        curve.points.every(
          (point) =>
            point.x >= bounds.minX - 1e-6 &&
            point.x <= bounds.maxX + 1e-6 &&
            point.y >= bounds.minY - 1e-6 &&
            point.y <= bounds.maxY + 1e-6
        )
      ).toBe(true);
    }
  });

  it("triangulates a deterministic seeded point set into unique Delaunay edges", () => {
    const first = generateDelaunayPaths(bounds, {
      rows: 5,
      cols: 4,
      seed: 2417,
      jitter: 0.4,
    });
    const second = generateDelaunayPaths(bounds, {
      rows: 5,
      cols: 4,
      seed: 2417,
      jitter: 0.4,
    });

    expect(first.points).toEqual(second.points);
    expect(first.triangles).toEqual(second.triangles);
    expect(first.paths).toEqual(second.paths);
    expect(first.points).toHaveLength(20);
    expect(first.triangles.length).toBeGreaterThan(0);
    expect(
      new Set(
        first.paths.map((path) => {
          const start = path.points[0]!;
          const end = path.points[1]!;
          return `${start.x.toFixed(6)},${start.y.toFixed(6)}:${end.x.toFixed(6)},${end.y.toFixed(6)}`;
        })
      ).size
    ).toBe(first.paths.length);
  });
});
