import { calculateDocumentMetrics } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender } from "../../test-helpers";
import { program } from "../index";
import defaultSet from "../params/default.json";

describe("hilbert-loops-gradient program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
    });
    const firstPath = document.layers[0]?.paths[0];

    expect(calculateDocumentMetrics(document).artLayerCount).toBe(1);
    expect(firstPath?.points).toHaveLength(4 ** defaultSet.params.order);
  });
});
