import { calculateDocumentMetrics, contentBounds } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender } from "../../test-helpers";
import { program } from "../index";
import defaultSet from "../params/default.json";

describe("peano-curve program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: false,
    });
    const metrics = calculateDocumentMetrics(document);

    expect(metrics.artLayerCount).toBe(1);
    expect(document.layers[0]?.paths).toHaveLength(1);
    expect(document.layers[0]?.paths[0]?.points.length ?? 0).toBeGreaterThan(200);
  });

  it("keeps the fitted Peano curve inside the printable content bounds", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: false,
    });
    const bounds = contentBounds(document.canvas);

    expect(
      document.layers[0]!.paths[0]!.points.every(
        (point) =>
          point.x >= bounds.minX - 1e-6 &&
          point.x <= bounds.maxX + 1e-6 &&
          point.y >= bounds.minY - 1e-6 &&
          point.y <= bounds.maxY + 1e-6
      )
    ).toBe(true);
  });
});
