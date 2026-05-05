import { calculateDocumentMetrics } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender } from "../../test-helpers";
import { program } from "../index";
import defaultSet from "../params/default.json";

describe("trochoid program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
    });
    const metrics = calculateDocumentMetrics(document);

    expect(metrics.artLayerCount).toBe(1);
    expect(metrics.pathCount).toBe(1);
  });
});
