import {
  calculateDocumentMetrics,
  normalizeParams,
  resolveProgramState,
  serializePlotDocumentToSvg,
  validatePlotDocument,
  type PlotDocument,
  type ProgramDefinition,
} from "@ligneclaire/sdk";
import { expect } from "vitest";

type ParamSet = Readonly<{
  params: Readonly<Record<string, unknown>>;
  programState?: unknown;
}>;

export function renderProgramCase(
  program: ProgramDefinition<any, any>,
  paramSet: ParamSet,
  options: Readonly<{
    caseName?: string;
    mode?: "preview" | "export" | "validation";
    showDebug?: boolean;
  }> = {}
): PlotDocument {
  const normalized = normalizeParams(program.params, paramSet.params);
  const programState = resolveProgramState(program, normalized.params, paramSet.programState);

  return program.render({
    programId: program.id,
    mode: options.mode ?? "validation",
    showDebug: options.showDebug ?? true,
    caseName: options.caseName,
    params: normalized.params,
    programState,
  });
}

export function expectDeterministicProgramRender(
  program: ProgramDefinition<any, any>,
  paramSet: ParamSet,
  options: Readonly<{
    caseName?: string;
    mode?: "preview" | "export" | "validation";
    showDebug?: boolean;
  }> = {}
): PlotDocument {
  const first = renderProgramCase(program, paramSet, options);
  const second = renderProgramCase(program, paramSet, options);
  const firstSvg = serializePlotDocumentToSvg(first, { includeDebugLayers: options.showDebug ?? true });
  const secondSvg = serializePlotDocumentToSvg(second, {
    includeDebugLayers: options.showDebug ?? true,
  });

  expect(firstSvg).toEqual(secondSvg);
  expect(validatePlotDocument(first).filter((issue) => issue.severity === "error")).toEqual([]);
  expect(calculateDocumentMetrics(first).pathCount).toBeGreaterThan(0);

  return first;
}
