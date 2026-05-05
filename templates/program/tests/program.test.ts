import {
  calculateDocumentMetrics,
  normalizeParams,
  resolveProgramState,
  serializePlotDocumentToSvg,
  validatePlotDocument,
} from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import defaultSet from "../params/default.json";
import { program } from "../index";

describe("__PROGRAM_ID__", () => {
  it("renders deterministically from the checked-in default set", () => {
    const normalized = normalizeParams(program.params, defaultSet.params);
    const state = resolveProgramState(program, normalized.params, defaultSet.programState);

    const document = program.render({
      programId: program.id,
      mode: "validation",
      caseName: "default",
      showDebug: true,
      params: normalized.params,
      programState: state,
    });

    expect(validatePlotDocument(document).filter((issue) => issue.severity === "error")).toEqual([]);
    expect(serializePlotDocumentToSvg(document)).toContain("<svg");
    expect(calculateDocumentMetrics(document).pathCount).toBeGreaterThan(0);
  });
});

