import { calculateDocumentMetrics, contentBounds, normalizeParams, resolveProgramState } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender } from "../../test-helpers";
import { parseHamiltonGuideCsv } from "../csv";
import {
  buildHamiltonResult,
  buildHamiltonEditableNodes,
  hamiltonNodeId,
  normalizeHamiltonProgramState,
  program,
  resolveHamiltonGuideNodeOffsets,
  selectHamiltonRenderProgramState,
} from "../index";
import defaultSet from "../params/default.json";

describe("hamilton-paths program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
    });
    const metrics = calculateDocumentMetrics(document);

    expect(metrics.artLayerCount).toBe(1);
    expect(document.layers[0]?.paths).toHaveLength(defaultSet.params.strokeCount);
    expect(
      document.layers[0]?.paths.every(
        (path) => path.points.length > defaultSet.params.rows * defaultSet.params.columns
      )
    ).toBe(true);
  });

  it("keeps every stroke inside the printable content bounds", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
    });
    const bounds = contentBounds(document.canvas);

    expect(
      document.layers.every((layer) =>
        layer.paths.every((path) =>
          path.points.every(
            (point) =>
              point.x >= bounds.minX - 1e-6 &&
              point.x <= bounds.maxX + 1e-6 &&
              point.y >= bounds.minY - 1e-6 &&
              point.y <= bounds.maxY + 1e-6
          )
        )
      )
    ).toBe(true);
  });

  it("keeps non-orthogonal lattices inside the printable content bounds", () => {
    const document = expectDeterministicProgramRender(
      program,
      {
        ...defaultSet,
        params: {
          ...defaultSet.params,
          gridRotationDeg: 12,
          latticeAngleDeg: 60,
          rowStepRatio: 1.1,
        },
      },
      {
        caseName: "default",
      }
    );
    const bounds = contentBounds(document.canvas);

    expect(
      document.layers.every((layer) =>
        layer.paths.every((path) =>
          path.points.every(
            (point) =>
              point.x >= bounds.minX - 1e-6 &&
              point.x <= bounds.maxX + 1e-6 &&
              point.y >= bounds.minY - 1e-6 &&
              point.y <= bounds.maxY + 1e-6
          )
        )
      )
    ).toBe(true);
  });

  it("keeps zero-deflection unrounded straight runs orthogonal", () => {
    const document = expectDeterministicProgramRender(
      program,
      {
        ...defaultSet,
        params: {
          ...defaultSet.params,
          cornerRadius: 0,
          deflection: 0,
        },
      },
      {
        caseName: "default",
      }
    );

    expect(
      document.layers.every((layer) =>
        layer.paths.every((path) =>
          path.points.slice(1).every((point, index) => {
            const previous = path.points[index]!;
            return (
              Math.abs(point.x - previous.x) < 1e-6 ||
              Math.abs(point.y - previous.y) < 1e-6
            );
          })
        )
      )
    ).toBe(true);
  });

  it("emits one fewer path when drawing centerlines", () => {
    const document = expectDeterministicProgramRender(
      program,
      {
        ...defaultSet,
        params: {
          ...defaultSet.params,
          drawCenterlines: true,
        },
      },
      {
        caseName: "default",
      }
    );

    expect(document.layers[0]?.paths).toHaveLength(defaultSet.params.strokeCount - 1);
  });

  it("draws one debug marker per base node", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: true,
    });

    expect(document.debugLayers).toHaveLength(1);
    expect(document.debugLayers?.[0]?.paths).toHaveLength(
      defaultSet.params.rows * defaultSet.params.columns
    );
  });

  it("normalizes stored node offsets against the current lattice", () => {
    const normalized = normalizeParams(program.params, defaultSet.params);
    const state = resolveProgramState(program, normalized.params, {
      nodeOffsets: {
        [hamiltonNodeId(0, 0)]: { x: 8, y: -6 },
        [hamiltonNodeId(999, 999)]: { x: 2, y: 2 },
        junk: { x: 5, y: 5 },
      },
      selectedNodeId: hamiltonNodeId(0, 0),
    });

    expect(Object.keys(state.nodeOffsets)).toEqual([hamiltonNodeId(0, 0)]);
    expect(state.selectedNodeId).toBe(hamiltonNodeId(0, 0));
  });

  it("renders manual node overrides in the debug node positions", () => {
    const normalized = normalizeParams(program.params, defaultSet.params);
    const programState = resolveProgramState(program, normalized.params, {
      nodeOffsets: {
        [hamiltonNodeId(0, 0)]: { x: 8, y: -6 },
      },
      selectedNodeId: hamiltonNodeId(0, 0),
    });
    const baseNodes = buildHamiltonEditableNodes(
      normalized.params,
      resolveProgramState(program, normalized.params, defaultSet.programState)
    );
    const movedNodes = buildHamiltonEditableNodes(normalized.params, programState);

    expect(movedNodes[0]!.position).toEqual({
      x: baseNodes[0]!.position.x + 8,
      y: baseNodes[0]!.position.y - 6,
    });
    expect(selectHamiltonRenderProgramState(programState)).toEqual({
      nodeOffsets: programState.nodeOffsets,
      guideMode: "manual",
      csvGuidePoints: [],
    });
  });

  it("parses csv guide points with an x/y header row", () => {
    expect(
      parseHamiltonGuideCsv(`
        x,y
        40.5,72
        88,140.25
      `)
    ).toEqual([
      { x: 40.5, y: 72 },
      { x: 88, y: 140.25 },
    ]);
  });

  it("maps csv guide points onto nearby lattice nodes and routes through them", () => {
    const normalized = normalizeParams(program.params, defaultSet.params);
    const bounds = contentBounds(program.canvas);
    const guidePoints = [
      { x: bounds.minX + 18, y: bounds.minY + 34 },
      { x: bounds.maxX - 28, y: bounds.maxY - 30 },
      { x: bounds.minX + 64, y: bounds.maxY - 48 },
    ] as const;
    const programState = normalizeHamiltonProgramState(
      {
        guideMode: "csv",
        csvGuideSourceName: "guide.csv",
        csvGuidePoints: guidePoints,
      },
      normalized.params
    );
    const guideOffsets = resolveHamiltonGuideNodeOffsets(normalized.params, programState.csvGuidePoints);
    const nodes = buildHamiltonEditableNodes(normalized.params, programState);
    const result = buildHamiltonResult(normalized.params, programState);

    expect(Object.keys(guideOffsets)).toHaveLength(guidePoints.length);
    expect(
      guidePoints.every((guidePoint) =>
        nodes.some(
          (node) =>
            Math.abs(node.position.x - guidePoint.x) < 1e-6 &&
            Math.abs(node.position.y - guidePoint.y) < 1e-6
        )
      )
    ).toBe(true);
    expect(
      guidePoints.every((guidePoint) =>
        result.centerline.points.some(
          (point) =>
            Math.abs(point.x - guidePoint.x) < 1e-6 &&
            Math.abs(point.y - guidePoint.y) < 1e-6
        )
      )
    ).toBe(true);
    expect(selectHamiltonRenderProgramState(programState)).toEqual({
      nodeOffsets: {},
      guideMode: "csv",
      csvGuidePoints: programState.csvGuidePoints,
    });
  });
});
