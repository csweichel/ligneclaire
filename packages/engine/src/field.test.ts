import { describe, expect, it } from "vitest";
import { createVectorField, sampleInterpolatedVector, traceContinuousVectorField, traceNearestVectorField } from "./field";

const bounds = {
  minX: 0,
  minY: 0,
  maxX: 10,
  maxY: 10,
} as const;

describe("field tracing", () => {
  it("interpolates vectors between neighboring field cells", () => {
    const field = createVectorField(bounds, {
      columns: 2,
      rows: 2,
      sampler(_point, cell) {
        return {
          angle: cell.row === 0 ? 0 : Math.PI / 2,
          length: 1,
        };
      },
    });

    const sampled = sampleInterpolatedVector(field, {
      x: 5,
      y: 5,
    });

    expect(sampled).not.toBeNull();
    expect(sampled!.angle).toBeCloseTo(Math.PI / 4, 4);
  });

  it("densifies continuous traces without changing their endpoints", () => {
    const field = createVectorField(bounds, {
      columns: 2,
      rows: 2,
      sampler() {
        return {
          angle: Math.PI / 4,
          length: 1,
        };
      },
    });
    const start = {
      x: 1,
      y: 1,
    };
    const segmented = traceNearestVectorField(field, start, {
      segmentLength: 1,
      steps: 4,
      bounds,
    });
    const continuous = traceContinuousVectorField(field, start, {
      segmentLength: 1,
      steps: 4,
      bounds,
      samplesPerSpan: 4,
    });

    expect(continuous.points.length).toBeGreaterThan(segmented.points.length);
    expect(continuous.points[0]).toEqual(segmented.points[0]);
    expect(continuous.points.at(-1)).toEqual(segmented.points.at(-1));
  });
});
