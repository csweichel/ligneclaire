import { describe, expect, it } from "vitest";
import { deformPolyline } from "./deform";

describe("deformPolyline", () => {
  it("resamples an open line and displaces it along a fixed direction", () => {
    const deformed = deformPolyline(
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 10 },
        ],
      },
      {
        mode: "direction",
        direction: { x: 1, y: 0 },
        segmentLength: 5,
        amount: ({ t }) => t * 4,
      }
    );

    expect(deformed.points).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 5 },
      { x: 4, y: 10 },
    ]);
  });

  it("can displace a straight line along its local normal", () => {
    const deformed = deformPolyline(
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      },
      {
        mode: "normal",
        segmentLength: 5,
        amount: () => 2,
      }
    );

    expect(deformed.points).toEqual([
      { x: 0, y: 2 },
      { x: 5, y: 2 },
      { x: 10, y: 2 },
    ]);
  });
});
