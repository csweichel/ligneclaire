import { calculateDocumentMetrics, contentBounds } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender } from "../../test-helpers";
import { program } from "../index";
import defaultSet from "../params/default.json";

describe("isometric-ribbons program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: false,
    });
    const metrics = calculateDocumentMetrics(document);

    expect(metrics.artLayerCount).toBe(2);
    expect(document.layers[0]?.paths.length ?? 0).toBeGreaterThan(500);
    expect(document.layers[1]?.paths.length ?? 0).toBeGreaterThan(120);
  });

  it("clips the ribbon field to a centered square crop inside the page margins", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: false,
    });

    const points = document.layers.flatMap((layer) =>
      layer.paths.flatMap((path) => path.points)
    );
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const bounds = contentBounds(document.canvas);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);

    expect(points.length).toBeGreaterThan(3000);
    expect(width).toBeGreaterThan(170);
    expect(Math.abs(width - height)).toBeLessThan(0.5);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(bounds.maxX + 1e-6);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(bounds.minY - 1e-6);
    expect(Math.max(...ys)).toBeLessThanOrEqual(bounds.maxY + 1e-6);
  });

  it("keeps the light highlight layer meaningfully present", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: false,
    });

    const primaryCount = document.layers[0]?.paths.length ?? 0;
    const accentCount = document.layers[1]?.paths.length ?? 0;

    expect(accentCount).toBeGreaterThan(120);
    expect(primaryCount / accentCount).toBeLessThan(4.5);
    expect(primaryCount / accentCount).toBeGreaterThan(1.5);
  });

  it("exposes the square crop outline in debug mode", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: true,
    });
    const crop = document.debugLayers?.[0]?.paths[0];

    expect(crop?.closed).toBe(true);
    expect(crop?.points).toHaveLength(4);
    for (let index = 1; index < (crop?.points.length ?? 0); index += 1) {
      const point = crop?.points[index]!;
      const previous = crop?.points[index - 1]!;
      const deltaX = Math.abs(point.x - previous.x);
      const deltaY = Math.abs(point.y - previous.y);

      expect(deltaX === 0 || deltaY === 0).toBe(true);
    }
  });
});
