import { describe, expect, it } from "vitest";
import { coalesceHeightMeshProbeReadings } from "./heightMesh";

describe("coalesceHeightMeshProbeReadings", () => {
  it("leaves single probe readings unchanged", () => {
    const readings = [
      { xMm: 0, yMm: 0, zMm: -1, probeTriggered: true, rawLine: "[PRB:0,0,-1:1]" },
      { xMm: 10, yMm: 0, zMm: -2, probeTriggered: true, rawLine: "[PRB:10,0,-2:1]" },
    ] as const;

    expect(coalesceHeightMeshProbeReadings(readings, 2)).toEqual(readings);
  });

  it("collapses doubled probe/release pairs to the lower Z reading", () => {
    expect(
      coalesceHeightMeshProbeReadings(
        [
          { xMm: 0, yMm: 0, zMm: -1.5, probeTriggered: true, rawLine: "[PRB:0,0,-1.5:1]" },
          { xMm: 0, yMm: 0, zMm: -1, probeTriggered: true, rawLine: "[PRB:0,0,-1:1]" },
          { xMm: 10, yMm: 0, zMm: -3, probeTriggered: true, rawLine: "[PRB:10,0,-3:1]" },
          { xMm: 10, yMm: 0, zMm: -2.25, probeTriggered: true, rawLine: "[PRB:10,0,-2.25:1]" },
        ],
        2
      )
    ).toEqual([
      { xMm: 0, yMm: 0, zMm: -1.5, probeTriggered: true, rawLine: "[PRB:0,0,-1.5:1]" },
      { xMm: 10, yMm: 0, zMm: -3, probeTriggered: true, rawLine: "[PRB:10,0,-3:1]" },
    ]);
  });
});
