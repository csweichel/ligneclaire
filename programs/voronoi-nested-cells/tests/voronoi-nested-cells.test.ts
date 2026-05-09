import { calculateDocumentMetrics } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender } from "../../test-helpers";
import { program } from "../index";
import defaultSet from "../params/default.json";

describe("voronoi-nested-cells program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: true,
    });
    const metrics = calculateDocumentMetrics(document);

    expect(metrics.artLayerCount).toBe(1);
    expect(metrics.debugLayerCount).toBe(1);
    expect(document.layers[0]?.paths).toHaveLength(
      defaultSet.params.pointCount * defaultSet.params.layerCount
    );
    expect(document.layers[0]?.paths.every((path) => path.closed === true)).toBe(true);
    expect(document.debugLayers?.[0]?.paths).toHaveLength(defaultSet.params.pointCount + 1);
  });
});
