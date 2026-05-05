import { calculateDocumentMetrics, normalizeParams, resolveProgramState } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender } from "../../test-helpers";
import { buildTilepathLayout, program } from "../index";
import defaultSet from "../params/default.json";

describe("tilepath-grid program", () => {
  it(
    "renders deterministically from the checked-in default parameter set",
    () => {
      const document = expectDeterministicProgramRender(program, defaultSet, {
        caseName: "default",
      });

      expect(calculateDocumentMetrics(document).artLayerCount).toBe(1);
    },
    15000
  );

  it("includes both arc and line tiles in the default layout", () => {
    const normalized = normalizeParams(program.params, defaultSet.params);
    const state = resolveProgramState(program, normalized.params, defaultSet.programState);
    const layout = buildTilepathLayout(normalized.params, state);
    const counts = layout.grid.tiles.reduce(
      (result, kind) => {
        result[kind] += 1;
        return result;
      },
      { arc: 0, line: 0 }
    );

    expect(counts.arc).toBeGreaterThan(0);
    expect(counts.line).toBeGreaterThan(0);
  });
});
