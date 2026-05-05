import { calculateDocumentMetrics, normalizeParams, resolveProgramState } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender } from "../../test-helpers";
import { applyToolToState, buildTilepathLayout, program } from "../index";
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

  it("keeps the seeded base layout stable when a cell override is applied", () => {
    const normalized = normalizeParams(program.params, defaultSet.params);
    const state = resolveProgramState(program, normalized.params, defaultSet.programState);
    const base = buildTilepathLayout(normalized.params, state);
    const next = buildTilepathLayout(
      normalized.params,
      applyToolToState(state, "cell:0:0", "arc-se")
    );

    let rotationChanges = 0;
    for (let index = 0; index < base.result.rotations.length; index += 1) {
      if (base.result.rotations[index] !== next.result.rotations[index]) {
        rotationChanges += 1;
      }
    }

    expect(rotationChanges).toBe(1);
  });
});
