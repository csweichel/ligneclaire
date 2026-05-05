import { calculateDocumentMetrics } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender, renderProgramCase } from "../../test-helpers";
import { program } from "../index";
import defaultSet from "../params/default.json";

describe("field program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
    });

    expect(calculateDocumentMetrics(document).artLayerCount).toBe(2);
  });

  it("can fall back to segmented traces when continuous curves are disabled", () => {
    const continuous = renderProgramCase(program, defaultSet, {
      caseName: "default",
    });
    const segmented = renderProgramCase(
      program,
      {
        ...defaultSet,
        params: {
          ...defaultSet.params,
          continuousCurves: false,
        },
      },
      {
        caseName: "default",
      }
    );

    expect(continuous.layers[0]!.paths[0]!.points.length).toBeGreaterThan(
      segmented.layers[0]!.paths[0]!.points.length
    );
  });
});
