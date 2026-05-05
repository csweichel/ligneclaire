import { describe, expect, it } from "vitest";
import type { Polyline } from "./document";
import { createProgressiveOffsetPaths } from "./geometry";

describe("createProgressiveOffsetPaths", () => {
  it("merges consecutive active segments for the same offset into a continuous polyline", () => {
    const polyline: Polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ],
    };

    const paths = createProgressiveOffsetPaths(polyline, [2, 2, 0], [1, -1]);

    expect(paths).toHaveLength(2);
    expect(paths[0]!.points).toEqual([
      { x: 0, y: 1 },
      { x: 10, y: 1 },
      { x: 20, y: 1 },
    ]);
    expect(paths[1]!.points).toEqual([
      { x: 0, y: -1 },
      { x: 10, y: -1 },
      { x: 20, y: -1 },
    ]);
  });

  it("splits runs when a lane becomes inactive and active again later", () => {
    const polyline: Polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ],
    };

    const paths = createProgressiveOffsetPaths(polyline, [1, 0, 1], [1]);

    expect(paths).toHaveLength(2);
    expect(paths[0]!.points).toEqual([
      { x: 0, y: 1 },
      { x: 10, y: 1 },
    ]);
    expect(paths[1]!.points).toEqual([
      { x: 20, y: 1 },
      { x: 30, y: 1 },
    ]);
  });
});
