import {
  calculateDocumentMetrics,
  contentBounds,
  plotPalette,
  type Polyline,
} from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender, renderProgramCase } from "../../test-helpers";
import { program } from "../index";
import {
  canConnectNodes,
  connectNodes,
  moveNode,
  normalizeNodeComposerProgramState,
  selectComposerNode,
  selectNodeComposerRenderState,
  type NodeComposerProgramState,
} from "../model";
import defaultSet from "../params/default.json";

function pathBounds(paths: readonly Polyline[]) {
  const points = paths.flatMap((path) => path.points);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function boundsCenter(bounds: ReturnType<typeof pathBounds>) {
  return {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };
}

describe("node-composer program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
      showDebug: true,
    });
    const metrics = calculateDocumentMetrics(document);

    expect(metrics.artLayerCount).toBeGreaterThanOrEqual(1);
    expect(metrics.debugLayerCount).toBe(1);
    expect(metrics.pathCount).toBeGreaterThan(80);
  });

  it("normalizes invalid nodes and rejects bad connections", () => {
    const normalized = normalizeNodeComposerProgramState({
      nodes: [
        {
          id: "node-a",
          kind: "line-grid",
          position: {
            x: -200,
            y: 9000,
          },
          config: {
            spacing: -5,
            angleDeg: 999,
          },
        },
        {
          id: "node-b",
          kind: "output-layer",
          position: {
            x: 220,
            y: 220,
          },
          config: {
            label: "Test Layer",
            enabled: true,
            style: "accent",
          },
        },
        {
          id: "node-c",
          kind: "missing-kind",
        },
        {
          id: "node-d",
          kind: "program:waves",
          position: {
            x: 300,
            y: 300,
          },
          config: {
            bands: 12,
          },
        },
      ],
      connections: [
        {
          from: {
            nodeId: "node-a",
            portId: "paths",
          },
          to: {
            nodeId: "node-b",
            portId: "paths",
          },
        },
        {
          from: {
            nodeId: "node-a",
            portId: "paths",
          },
          to: {
            nodeId: "node-b",
            portId: "paths",
          },
        },
        {
          from: {
            nodeId: "node-b",
            portId: "paths",
          },
          to: {
            nodeId: "node-a",
            portId: "paths",
          },
        },
        {
          from: {
            nodeId: "ghost",
            portId: "paths",
          },
          to: {
            nodeId: "node-b",
            portId: "paths",
          },
        },
      ],
      selectedNodeId: "node-b",
      nextNodeNumber: 3,
    });

    expect(normalized.nodes).toHaveLength(3);
    expect(normalized.connections).toHaveLength(1);
    expect(normalized.selectedNodeId).toBe("node-b");
    expect(normalized.nodes[0]!.position.x).toBeGreaterThanOrEqual(24);
    expect(normalized.nodes[0]!.position.y).toBeLessThanOrEqual(2200);
    expect(normalized.nodes[2]).toMatchObject({
      kind: "program",
      config: {
        programId: "waves",
      },
    });
  });

  it("loads legacy path-scale nodes as path-transform", () => {
    const normalized = normalizeNodeComposerProgramState({
      nodes: [
        {
          id: "node-a",
          kind: "path-scale",
          position: {
            x: 320,
            y: 240,
          },
          config: {
            scaleX: 0.5,
            scaleY: 0.75,
          },
        },
      ],
      connections: [],
      selectedNodeId: "node-a",
      nextNodeNumber: 2,
    });

    expect(normalized.nodes).toHaveLength(1);
    expect(normalized.nodes[0]).toMatchObject({
      kind: "path-transform",
      config: {
        translateX: 0,
        translateY: 0,
        scaleX: 0.5,
        scaleY: 0.75,
        rotationDeg: 0,
      },
    });
  });

  it("supports boolean mask clipping with multiple output layers", () => {
    const programState: NodeComposerProgramState = {
      nodes: [
        {
          id: "node-1",
          kind: "line-grid",
          position: { x: 40, y: 40 },
          config: {
            centerX: 105,
            centerY: 148.5,
            width: 150,
            height: 200,
            spacing: 8,
            angleDeg: 45,
          },
        },
        {
          id: "node-2",
          kind: "mask-circle",
          position: { x: 320, y: 40 },
          config: {
            centerX: 95,
            centerY: 152,
            radius: 60,
          },
        },
        {
          id: "node-3",
          kind: "mask-polygon",
          position: { x: 320, y: 190 },
          config: {
            centerX: 126,
            centerY: 130,
            radius: 40,
            sides: 5,
            rotationDeg: 8,
          },
        },
        {
          id: "node-4",
          kind: "mask-boolean",
          position: { x: 560, y: 110 },
          config: {
            operation: "subtract",
          },
        },
        {
          id: "node-5",
          kind: "clip-mask",
          position: { x: 790, y: 110 },
          config: {
            mode: "clip",
          },
        },
        {
          id: "node-6",
          kind: "output-layer",
          position: { x: 1020, y: 110 },
          config: {
            label: "Masked Lines",
            style: "primary",
            enabled: true,
          },
        },
        {
          id: "node-7",
          kind: "trochoid",
          position: { x: 560, y: 300 },
          config: {
            centerX: 105,
            centerY: 92,
            useEpitrochoid: true,
            fixedRadius: 68,
            rollingRadius: 16,
            pointOffsetRatio: 1.1,
            figureRadius: 28,
            rotationDeg: 15,
            samplesPerTurn: 220,
          },
        },
        {
          id: "node-8",
          kind: "output-layer",
          position: { x: 1020, y: 300 },
          config: {
            label: "Accent Figure",
            style: "accent",
            enabled: true,
          },
        },
      ],
      connections: [
        {
          from: { nodeId: "node-1", portId: "paths" },
          to: { nodeId: "node-5", portId: "paths" },
        },
        {
          from: { nodeId: "node-2", portId: "mask" },
          to: { nodeId: "node-4", portId: "a" },
        },
        {
          from: { nodeId: "node-3", portId: "mask" },
          to: { nodeId: "node-4", portId: "b" },
        },
        {
          from: { nodeId: "node-4", portId: "mask" },
          to: { nodeId: "node-5", portId: "mask" },
        },
        {
          from: { nodeId: "node-5", portId: "paths" },
          to: { nodeId: "node-6", portId: "paths" },
        },
        {
          from: { nodeId: "node-7", portId: "paths" },
          to: { nodeId: "node-8", portId: "paths" },
        },
      ],
      selectedNodeId: "node-5",
      nextNodeNumber: 9,
    };

    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState,
      },
      {
        caseName: "default",
        showDebug: false,
      }
    );

    expect(document.layers).toHaveLength(2);
    expect(document.layers[0]!.stroke).toBe(plotPalette.primary);
    expect(document.layers[1]!.stroke).toBe(plotPalette.accent);
    expect(document.layers[0]!.paths.length).toBeGreaterThan(0);
    expect(document.layers[1]!.paths.length).toBe(1);
  });

  it("lets one output feed multiple downstream layers", () => {
    const baseState: NodeComposerProgramState = {
      nodes: [
        {
          id: "node-1",
          kind: "line-grid",
          position: { x: 40, y: 40 },
          config: {
            centerX: 105,
            centerY: 148.5,
            width: 150,
            height: 200,
            spacing: 8,
            angleDeg: 45,
          },
        },
        {
          id: "node-2",
          kind: "output-layer",
          position: { x: 1020, y: 110 },
          config: {
            label: "Primary Layer",
            style: "primary",
            enabled: true,
          },
        },
        {
          id: "node-3",
          kind: "output-layer",
          position: { x: 1020, y: 280 },
          config: {
            label: "Accent Layer",
            style: "accent",
            enabled: true,
          },
        },
      ],
      connections: [
        {
          from: { nodeId: "node-1", portId: "paths" },
          to: { nodeId: "node-2", portId: "paths" },
        },
      ],
      selectedNodeId: "node-1",
      nextNodeNumber: 4,
    };
    const secondConnection = {
      from: { nodeId: "node-1", portId: "paths" },
      to: { nodeId: "node-3", portId: "paths" },
    } as const;

    expect(canConnectNodes(baseState, secondConnection)).toBe(true);

    const nextState = connectNodes(baseState, secondConnection);
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: nextState,
      },
      {
        caseName: "default",
        showDebug: false,
      }
    );

    expect(nextState.connections).toHaveLength(2);
    expect(
      nextState.connections.filter(
        (connection) =>
          connection.from.nodeId === "node-1" && connection.from.portId === "paths"
      )
    ).toHaveLength(2);
    expect(document.layers).toHaveLength(2);
    expect(document.layers[0]!.stroke).toBe(plotPalette.primary);
    expect(document.layers[1]!.stroke).toBe(plotPalette.accent);
    expect(document.layers[0]!.paths.length).toBeGreaterThan(0);
    expect(document.layers[0]!.paths.length).toBe(document.layers[1]!.paths.length);
  });

  it("transforms path streams with translate, scale, and rotate", () => {
    const baseState: NodeComposerProgramState = {
      nodes: [
        {
          id: "node-1",
          kind: "line-grid",
          position: { x: 40, y: 40 },
          config: {
            centerX: 105,
            centerY: 148.5,
            width: 120,
            height: 160,
            spacing: 10,
            angleDeg: 0,
          },
        },
        {
          id: "node-2",
          kind: "output-layer",
          position: { x: 1020, y: 110 },
          config: {
            label: "Base",
            style: "primary",
            enabled: true,
          },
        },
      ],
      connections: [
        {
          from: { nodeId: "node-1", portId: "paths" },
          to: { nodeId: "node-2", portId: "paths" },
        },
      ],
      selectedNodeId: "node-1",
      nextNodeNumber: 3,
    };
    const scaledState: NodeComposerProgramState = {
      nodes: [
        baseState.nodes[0]!,
        {
          id: "node-2",
          kind: "path-transform",
          position: { x: 560, y: 110 },
          config: {
            translateX: 18,
            translateY: -12,
            scaleX: 0.5,
            scaleY: 0.75,
            rotationDeg: 90,
          },
        },
        {
          id: "node-3",
          kind: "output-layer",
          position: { x: 1020, y: 110 },
          config: {
            label: "Scaled",
            style: "primary",
            enabled: true,
          },
        },
      ],
      connections: [
        {
          from: { nodeId: "node-1", portId: "paths" },
          to: { nodeId: "node-2", portId: "paths" },
        },
        {
          from: { nodeId: "node-2", portId: "paths" },
          to: { nodeId: "node-3", portId: "paths" },
        },
      ],
      selectedNodeId: "node-2",
      nextNodeNumber: 4,
    };

    const baseDocument = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: baseState,
      },
      {
        caseName: "default",
        showDebug: false,
      }
    );
    const scaledDocument = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: scaledState,
      },
      {
        caseName: "default",
        showDebug: false,
      }
    );
    const baseBounds = pathBounds(baseDocument.layers[0]!.paths);
    const scaledBounds = pathBounds(scaledDocument.layers[0]!.paths);
    const baseCenter = boundsCenter(baseBounds);
    const scaledCenter = boundsCenter(scaledBounds);

    expect(scaledDocument.layers[0]!.paths).toHaveLength(baseDocument.layers[0]!.paths.length);
    expect(scaledCenter.x).toBeCloseTo(baseCenter.x + 18, 3);
    expect(scaledCenter.y).toBeCloseTo(baseCenter.y - 12, 3);
    expect(scaledBounds.maxX - scaledBounds.minX).toBeCloseTo(
      (baseBounds.maxY - baseBounds.minY) * 0.75,
      3
    );
    expect(scaledBounds.maxY - scaledBounds.minY).toBeCloseTo(
      (baseBounds.maxX - baseBounds.minX) * 0.5,
      3
    );
  });

  it("uses standalone programs as path-generating nodes", () => {
    const bounds = contentBounds(program.canvas);
    const programState: NodeComposerProgramState = {
      nodes: [
        {
          id: "node-1",
          kind: "program",
          position: { x: 40, y: 40 },
          config: {
            programId: "waves",
            seed: 1337,
            bands: 8,
            amplitude: 10,
            frequency: 2.4,
            warp: 0.5,
            mirror: true,
          },
        },
        {
          id: "node-2",
          kind: "output-layer",
          position: { x: 1020, y: 40 },
          config: {
            label: "Embedded Waves",
            style: "primary",
            enabled: true,
          },
        },
      ],
      connections: [
        {
          from: { nodeId: "node-1", portId: "paths" },
          to: { nodeId: "node-2", portId: "paths" },
        },
      ],
      selectedNodeId: "node-1",
      nextNodeNumber: 3,
    };

    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState,
      },
      {
        caseName: "default",
        showDebug: false,
      }
    );

    expect(document.layers).toHaveLength(1);
    expect(document.layers[0]!.paths).toHaveLength(8);
    expect(
      document.layers[0]!.paths.every((path) =>
        path.points.every(
          (point) =>
            point.x >= bounds.minX &&
            point.x <= bounds.maxX &&
            point.y >= bounds.minY &&
            point.y <= bounds.maxY
        )
      )
    ).toBe(true);
  });

  it("renders Hamilton path generator nodes with configurable parallel strokes", () => {
    const bounds = contentBounds(program.canvas);
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "hamilton-path",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                width: 146,
                height: 220,
                seed: 2417,
                columns: 18,
                rows: 28,
                strokeCount: 3,
                strokeSpacing: 0.72,
                cornerRadius: 1.1,
                deflection: 0,
                drawCenterlines: true,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 1020, y: 40 },
              config: {
                label: "Hamilton",
                style: "primary",
                enabled: true,
              },
            },
          ],
          connections: [
            {
              from: { nodeId: "node-1", portId: "paths" },
              to: { nodeId: "node-2", portId: "paths" },
            },
          ],
          selectedNodeId: "node-1",
          nextNodeNumber: 3,
        },
      },
      {
        caseName: "default",
        showDebug: false,
      }
    );

    expect(document.layers).toHaveLength(1);
    expect(document.layers[0]!.paths).toHaveLength(2);
    expect(
      document.layers[0]!.paths.every((path) =>
        path.points.every(
          (point) =>
            point.x >= bounds.minX &&
            point.x <= bounds.maxX &&
            point.y >= bounds.minY &&
            point.y <= bounds.maxY
        )
      )
    ).toBe(true);
  });

  it("uses a connected mask as the Hamilton path domain", () => {
    const center = { x: 105, y: 148.5 };
    const radius = 54;
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "mask-circle",
              position: { x: 40, y: 40 },
              config: {
                centerX: center.x,
                centerY: center.y,
                radius,
              },
            },
            {
              id: "node-2",
              kind: "hamilton-path",
              position: { x: 340, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                width: 160,
                height: 240,
                seed: 2417,
                columns: 18,
                rows: 28,
                strokeCount: 3,
                strokeSpacing: 3.5,
                cornerRadius: 1.1,
                deflection: 0,
                drawCenterlines: true,
              },
            },
            {
              id: "node-3",
              kind: "output-layer",
              position: { x: 1020, y: 40 },
              config: {
                label: "Hamilton",
                style: "primary",
                enabled: true,
              },
            },
          ],
          connections: [
            {
              from: { nodeId: "node-1", portId: "mask" },
              to: { nodeId: "node-2", portId: "domain" },
            },
            {
              from: { nodeId: "node-2", portId: "paths" },
              to: { nodeId: "node-3", portId: "paths" },
            },
          ],
          selectedNodeId: "node-2",
          nextNodeNumber: 4,
        },
      },
      {
        caseName: "default",
        showDebug: false,
      }
    );

    expect(document.layers).toHaveLength(1);
    expect(document.layers[0]!.paths.length).toBeGreaterThanOrEqual(2);
    expect(
      document.layers[0]!.paths.every((path) =>
        path.points.every(
          (point) => Math.hypot(point.x - center.x, point.y - center.y) <= radius + 1e-6
        )
      )
    ).toBe(true);
  });

  it("can preload an embedded program from an existing parameter set", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "program",
              position: { x: 40, y: 40 },
              config: {
                programId: "trochoid",
                paramSetId: "large",
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 1020, y: 40 },
              config: {
                label: "Preset Trochoid",
                style: "primary",
                enabled: true,
              },
            },
          ],
          connections: [
            {
              from: { nodeId: "node-1", portId: "paths" },
              to: { nodeId: "node-2", portId: "paths" },
            },
          ],
          selectedNodeId: "node-1",
          nextNodeNumber: 3,
        },
      },
      {
        caseName: "default",
        showDebug: false,
      }
    );

    expect(document.layers).toHaveLength(1);
    expect(document.layers[0]!.paths.length).toBeGreaterThan(20);
  });

  it("routes terrain slices into separate water and terrain layers", () => {
    const programState: NodeComposerProgramState = {
      nodes: [
        {
          id: "node-1",
          kind: "terrain-slice",
          position: { x: 40, y: 40 },
          config: {
            centerX: 105,
            centerY: 148.5,
            width: 118,
            height: 92,
            terrainOffsetX: 12,
            terrainOffsetY: -8,
            seed: 2812,
            contourLevels: 12,
            mountainScale: 0.68,
            relief: 22,
            waterLevel: 0.42,
            roughness: 0.62,
            hatchSpacing: 0.88,
            waterSpacing: 0.62,
          },
        },
        {
          id: "node-2",
          kind: "output-layer",
          position: { x: 1040, y: 40 },
          config: {
            label: "Water",
            style: "water",
            enabled: true,
          },
        },
        {
          id: "node-3",
          kind: "output-layer",
          position: { x: 1040, y: 180 },
          config: {
            label: "Terrain",
            style: "primary",
            enabled: true,
          },
        },
      ],
      connections: [
        {
          from: { nodeId: "node-1", portId: "water" },
          to: { nodeId: "node-2", portId: "paths" },
        },
        {
          from: { nodeId: "node-1", portId: "terrain" },
          to: { nodeId: "node-3", portId: "paths" },
        },
      ],
      selectedNodeId: "node-1",
      nextNodeNumber: 4,
    };

    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState,
      },
      {
        caseName: "default",
        showDebug: true,
      }
    );

    expect(document.layers).toHaveLength(2);
    expect(document.layers[0]!.stroke).toBe(plotPalette.water);
    expect(document.layers[1]!.stroke).toBe(plotPalette.primary);
    expect(document.layers[0]!.paths.length).toBeGreaterThan(40);
    expect(document.layers[1]!.paths.length).toBeGreaterThan(30);
    expect(document.debugLayers?.[0]?.paths.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("ignores layout-only edits when deriving render state", () => {
    const base = normalizeNodeComposerProgramState(defaultSet.programState);
    const moved = moveNode(base, base.nodes[0]!.id, { x: 640, y: 480 });
    const reselected = selectComposerNode(moved, base.nodes.at(-1)!.id);

    expect(selectNodeComposerRenderState(reselected)).toEqual(
      selectNodeComposerRenderState(base)
    );
  });

  it("normalizes missing or malformed state before deriving render state", () => {
    expect(() => selectNodeComposerRenderState(undefined)).not.toThrow();

    const fallback = selectNodeComposerRenderState(undefined);
    const malformed = selectNodeComposerRenderState({
      nodes: [
        {
          id: "bad-node",
          kind: "line-grid",
          config: {
            spacing: -10,
          },
        },
        null,
      ],
      connections: "invalid",
    });

    expect(fallback.nodes.length).toBeGreaterThan(0);
    expect(malformed.nodes.length).toBeGreaterThan(0);
    expect(malformed.nodes[0]?.kind).toBe("line-grid");
    expect(malformed.nodes[0]?.config).toMatchObject({
      spacing: expect.any(Number),
    });
    expect(malformed.connections).toEqual([]);
  });
});
