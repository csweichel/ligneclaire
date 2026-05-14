import { describe, expect, it } from "vitest";
import {
  buildHeightMeshSamplePoints,
  createHeightMeshFile,
  createHeightMeshSamplerGcode,
  parseHeightMeshProbeLine,
  sampleHeightMeshZ,
} from "./height-mesh";

describe("buildHeightMeshSamplePoints", () => {
  it("builds a serpentine grid across the requested sampling region", () => {
    const points = buildHeightMeshSamplePoints(
      {
        widthMm: 120,
        heightMm: 80,
      },
      {
        columns: 3,
        rows: 2,
        originXMm: 10,
        originYMm: 20,
        widthMm: 90,
        heightMm: 40,
        moveFeedRateMmPerMin: 1000,
        probeFeedRateMmPerMin: 400,
        releaseFeedRateMmPerMin: 100,
        probeDepthMm: -25,
        releaseDistanceMm: 10,
      }
    );

    expect(points.map(({ xMm, yMm }) => [xMm, yMm])).toEqual([
      [10, 20],
      [55, 20],
      [100, 20],
      [100, 60],
      [55, 60],
      [10, 60],
    ]);
  });
});

describe("createHeightMeshSamplerGcode", () => {
  it("produces configurable probe and release commands", () => {
    const gcode = createHeightMeshSamplerGcode(
      {
        widthMm: 100,
        heightMm: 100,
      },
      "mm",
      {
        columns: 2,
        rows: 1,
        moveFeedRateMmPerMin: 1000,
        probeFeedRateMmPerMin: 400,
        releaseFeedRateMmPerMin: 100,
        probeDepthMm: -25,
        releaseDistanceMm: 10,
        clearanceMm: 1,
      }
    );

    expect(gcode).toContain("G21\nG90");
    expect(gcode).toContain("G1 X0 Y50 F1000");
    expect(gcode).toContain("G1 F400\nG38.2 Z-25");
    expect(gcode).toContain("G1 F100\nG38.4 Z10");
    expect(gcode).toContain("G0 Z1\nG90");
    expect(gcode).toContain("G1 X100 Y50 F1000");
  });
});

describe("parseHeightMeshProbeLine", () => {
  it("parses GRBL probe response lines", () => {
    expect(parseHeightMeshProbeLine("[PRB:10.5,20,-3.25:1]")).toEqual({
      xMm: 10.5,
      yMm: 20,
      zMm: -3.25,
      probeTriggered: true,
      rawLine: "[PRB:10.5,20,-3.25:1]",
    });
  });
});

describe("sampleHeightMeshZ", () => {
  it("bilinearly interpolates between captured samples", () => {
    const mesh = createHeightMeshFile(
      {
        widthMm: 100,
        heightMm: 100,
      },
      {
        columns: 2,
        rows: 2,
        moveFeedRateMmPerMin: 1000,
        probeFeedRateMmPerMin: 400,
        releaseFeedRateMmPerMin: 100,
        probeDepthMm: -25,
        releaseDistanceMm: 10,
      },
      [
        { xMm: 0, yMm: 0, zMm: 0, probeTriggered: true, rawLine: "[PRB:0,0,0:1]" },
        { xMm: 100, yMm: 0, zMm: -2, probeTriggered: true, rawLine: "[PRB:100,0,-2:1]" },
        { xMm: 100, yMm: 100, zMm: -4, probeTriggered: true, rawLine: "[PRB:100,100,-4:1]" },
        { xMm: 0, yMm: 100, zMm: -2, probeTriggered: true, rawLine: "[PRB:0,100,-2:1]" },
      ],
      {
        plotterId: "vanilla",
      }
    );

    expect(sampleHeightMeshZ(mesh, 50, 50)).toBeCloseTo(-2, 6);
  });
});
