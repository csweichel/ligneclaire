import { calculateDocumentMetrics, normalizeParams, resolveProgramState } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender, renderProgramCase } from "../../test-helpers";
import {
  buildImageLineDrawingCache,
  imageLineDrawingCacheKey,
  program,
  type ImageLineDrawingProgramState,
} from "../index";
import defaultSet from "../params/default.json";

describe("image-line-drawing program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
    });

    const metrics = calculateDocumentMetrics(document);
    expect(metrics.artLayerCount).toBe(1);
    expect(document.layers[0]?.paths).toHaveLength(1);
  });

  it("reuses a matching programState cache during render", () => {
    const normalized = normalizeParams(program.params, defaultSet.params);
    const state = resolveProgramState(program, normalized.params, defaultSet.programState);
    const cache = buildImageLineDrawingCache(state.image!, normalized.params);
    const document = renderProgramCase(
      program,
      {
        params: defaultSet.params,
        programState: {
          ...state,
          cache,
        } satisfies ImageLineDrawingProgramState,
      },
      { showDebug: false }
    );

    expect(document.metadata?.cache).toBe("hit");
    expect(document.layers[0]?.paths[0]?.points.length).toBe(cache.path.points.length);
  });

  it("drops stale caches when parameters change", () => {
    const normalized = normalizeParams(program.params, defaultSet.params);
    const state = resolveProgramState(program, normalized.params, defaultSet.programState);
    const cache = buildImageLineDrawingCache(state.image!, normalized.params);
    const nextParams = {
      ...normalized.params,
      levels: normalized.params.levels + 1,
    };
    const nextState = resolveProgramState(program, nextParams, {
      ...state,
      cache,
    });

    expect(nextState.cache).toBeNull();
    expect(imageLineDrawingCacheKey(state.image!, nextParams)).not.toBe(cache.key);
  });
});
