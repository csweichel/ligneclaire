import { calculateDocumentMetrics, normalizeParams, serializePlotDocumentToSvg, validatePlotDocument } from "@ligneclaire/engine";
import { resolveProgramState } from "@ligneclaire/sdk";
import type { RenderRequest, RenderResponse } from "./api-types";
import { defaultRenderState, loadParamSet } from "./param-store";
import { getProgram } from "./registry";

export async function renderProgram(request: RenderRequest): Promise<RenderResponse> {
  const program = getProgram(request.programId);

  const source = request.paramSetId ? await loadParamSet(request.programId, request.paramSetId) : null;
  const defaultState = defaultRenderState(request.programId);
  const normalized = normalizeParams(program.params, request.params ?? source?.params ?? defaultState.params);
  const programState = resolveProgramState(
    program,
    normalized.params,
    request.programState ?? source?.programState ?? defaultState.programState
  );

  const document = program.render({
    programId: program.id,
    mode: request.mode ?? "preview",
    caseName: request.caseName,
    params: normalized.params,
    programState,
    showDebug: request.showDebug ?? false,
  });
  const metrics = calculateDocumentMetrics(document);
  const validationIssues = validatePlotDocument(document);
  const svg = serializePlotDocumentToSvg(document, {
    includeDebugLayers: request.showDebug ?? false,
    title: program.title,
  });

  return {
    programId: program.id,
    canvas: document.canvas,
    svg,
    metrics,
    params: normalized.params,
    programState,
    normalizationIssues: normalized.issues,
    validationIssues,
  };
}
