import { describe, expect, it } from "vitest";
import { sampleEpitrochoid, sampleHypotrochoid } from "./trochoid";

describe("trochoid sampling", () => {
  it("closes a hypotrochoid when integer radii share a rational ratio", () => {
    const path = sampleHypotrochoid({
      fixedRadius: 12,
      rollingRadius: 5,
      pointOffset: 3,
      samplesPerTurn: 20,
    });

    expect(path.points.length).toBe(24 * 5 + 1);
    expect(path.points[0]!.x).toBeCloseTo(path.points.at(-1)!.x, 6);
    expect(path.points[0]!.y).toBeCloseTo(path.points.at(-1)!.y, 6);
  });

  it("applies rotation and center translation to epitrochoids", () => {
    const path = sampleEpitrochoid({
      fixedRadius: 8,
      rollingRadius: 6,
      pointOffset: 2,
      samplesPerTurn: 10,
      rotation: Math.PI / 2,
      center: { x: 5, y: 7 },
    });

    expect(path.points[0]!.x).toBeCloseTo(5, 6);
    expect(path.points[0]!.y).toBeCloseTo(19, 6);
  });
});
