import { calculateDocumentMetrics, contentBounds } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender } from "../../test-helpers";
import { program } from "../index";
import defaultSet from "../params/default.json";

describe("sculpture-scan program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: false,
    });
    const metrics = calculateDocumentMetrics(document);
    const bounds = contentBounds(document.canvas);
    const points = document.layers.flatMap((layer) => layer.paths.flatMap((path) => path.points));

    expect(metrics.artLayerCount).toBe(1);
    expect(metrics.pathCount).toBeGreaterThan(200);
    expect(metrics.segmentCount).toBeGreaterThan(58000);
    expect(points.length).toBeGreaterThan(58000);
    expect(Math.min(...points.map((point) => point.x))).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
    expect(Math.max(...points.map((point) => point.x))).toBeLessThanOrEqual(bounds.maxX + 1e-6);
    expect(Math.min(...points.map((point) => point.y))).toBeGreaterThanOrEqual(bounds.minY - 1e-6);
    expect(Math.max(...points.map((point) => point.y))).toBeLessThanOrEqual(bounds.maxY + 1e-6);
  });

  it("produces scan lines with meaningful lateral sculpting", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: false,
    });
    const spans = document.layers[0]!.paths.map((path) => {
      const xs = path.points.map((point) => point.x);
      return Math.max(...xs) - Math.min(...xs);
    });
    const maxLateralSpan = Math.max(...spans);
    const averageLateralSpan = spans.reduce((total, value) => total + value, 0) / spans.length;

    expect(maxLateralSpan).toBeGreaterThan(12);
    expect(averageLateralSpan).toBeGreaterThan(3.5);
  });

  it("exposes the sculpting masses in debug mode", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: true,
    });

    expect(document.debugLayers).toHaveLength(1);
    expect(document.debugLayers?.[0]?.paths).toHaveLength(defaultSet.params.features);
  });
});
