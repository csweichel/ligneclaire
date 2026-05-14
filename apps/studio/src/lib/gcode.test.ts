import { describe, expect, it } from "vitest";
import { parseGcodePreview } from "./gcode";

describe("parseGcodePreview", () => {
  it("tracks pen state and movement segments from generated gcode", () => {
    const preview = parseGcodePreview(`
      G21
      G90
      M5
      G1 X0 Y0 F1200
      M3 S400
      G1 X10 Y5 F1200
      G1 X20 Y5 F1200
      M5
      G1 X25 Y15 F1200
    `);

    expect(preview.lineCount).toBe(9);
    expect(preview.segments).toHaveLength(3);
    expect(preview.drawingSegments).toBe(2);
    expect(preview.travelSegments).toBe(1);
    expect(preview.bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: 25,
      maxY: 15,
    });
  });

  it("supports relative coordinates and inch units", () => {
    const preview = parseGcodePreview(`
      G20
      G91
      M3 S400
      G1 X1 Y0
      G1 X0 Y1
    `);

    expect(preview.segments).toHaveLength(2);
    expect(preview.segments[0]?.to.x).toBeCloseTo(25.4, 6);
    expect(preview.segments[1]?.to.y).toBeCloseTo(25.4, 6);
  });

  it("treats relative Z lifts and drops as pen state changes", () => {
    const preview = parseGcodePreview(`
      G21
      G90
      G91
      G0 Z-15
      G90
      G0 X0 Y0
      G91
      G0 Z15
      G90
      G1 X10 Y5
      G91
      G0 Z-15
      G90
      G0 X20 Y5
    `);

    expect(preview.segments).toHaveLength(2);
    expect(preview.drawingSegments).toBe(1);
    expect(preview.travelSegments).toBe(1);
    expect(preview.segments[0]?.drawing).toBe(true);
    expect(preview.segments[1]?.drawing).toBe(false);
  });

  it("keeps mixed XYZ drawing moves marked as drawing segments", () => {
    const preview = parseGcodePreview(`
      G21
      G90
      M3 S400
      G1 X10 Y0 Z-1 F1200
      G1 X20 Y0 Z-2 F1200
      M5
    `);

    expect(preview.segments).toHaveLength(2);
    expect(preview.drawingSegments).toBe(2);
    expect(preview.segments.every((segment) => segment.drawing)).toBe(true);
  });
});
