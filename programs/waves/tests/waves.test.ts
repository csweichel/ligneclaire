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

describe("waves program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const normalized = normalizeParams(program.params, defaultSet.params);
    const state = resolveProgramState(program, normalized.params, defaultSet.programState);

    const renderInput = {
      programId: program.id,
      mode: "validation" as const,
      showDebug: true,
      caseName: "default",
      params: normalized.params,
      programState: state,
    };

    const first = program.render(renderInput);
    const second = program.render(renderInput);
    const firstSvg = serializePlotDocumentToSvg(first);
    const secondSvg = serializePlotDocumentToSvg(second);

    expect(firstSvg).toEqual(secondSvg);
    expect(validatePlotDocument(first).filter((issue) => issue.severity === "error")).toEqual([]);
    expect(calculateDocumentMetrics(first)).toMatchObject({
      artLayerCount: 2,
      debugLayerCount: 1,
      pathCount: 54,
    });
  });

  it("keeps debug geometry out of normal exports", () => {
    const normalized = normalizeParams(program.params, defaultSet.params);
    const state = resolveProgramState(program, normalized.params, defaultSet.programState);
    const document = program.render({
      programId: program.id,
      mode: "preview",
      showDebug: true,
      params: normalized.params,
      programState: state,
    });

    const rawSvg = serializePlotDocumentToSvg(document);
    const debugSvg = serializePlotDocumentToSvg(document, { includeDebugLayers: true });

    expect(rawSvg).not.toContain("focus-guide");
    expect(debugSvg).toContain("focus-guide");
  });
});
