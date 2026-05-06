import {
  calculateDocumentMetrics,
  contentBounds,
  plotPalette,
} from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender, renderProgramCase } from "../../test-helpers";
import { program } from "../index";
import {
  moveNode,
  normalizeNodeComposerProgramState,
  selectComposerNode,
  selectNodeComposerRenderState,
  type NodeComposerProgramState,
} from "../model";
import defaultSet from "../params/default.json";

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
