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
  guidePathsForNode,
  moveNode,
  normalizeNodeComposerProgramState,
  selectComposerNode,
  selectNodeComposerRenderState,
  type NodeComposerProgramState,
} from "../model";
import { encodeSvgMaskData } from "../svgMask";
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

function segmentMidpoints(paths: readonly Polyline[]) {
  return paths.flatMap((path) =>
    path.points.slice(1).map((point, index) => ({
      x: (path.points[index]!.x + point.x) * 0.5,
      y: (path.points[index]!.y + point.y) * 0.5,
    }))
  );
}

function encodeFilledSvgMask(
  columns: number,
  rows: number,
  isFilled: (column: number, row: number) => boolean
): string {
  const bits = new Uint8Array(Math.ceil((columns * rows) / 8));

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (!isFilled(column, row)) {
        continue;
      }

      const index = row * columns + column;
      const byteIndex = Math.floor(index / 8);
      bits[byteIndex] = (bits[byteIndex] ?? 0) | (1 << (index % 8));
    }
  }

  return encodeSvgMaskData({
    columns,
    rows,
    bits,
  });
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

  it("uses configured page size and clips output to the configured content area", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "line-grid",
              position: { x: 40, y: 40 },
              config: {
                centerX: 80,
                centerY: 50,
                width: 180,
                height: 110,
                spacing: 10,
                angleDeg: 0,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 1020, y: 40 },
              config: {
                label: "Custom Page",
                style: "primary",
                enabled: true,
                pageWidthMm: 160,
                pageHeightMm: 100,
                pageMarginMm: 8,
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
    const metrics = calculateDocumentMetrics(document);
    const outputBounds = pathBounds(document.layers.flatMap((layer) => layer.paths));

    expect(document.canvas).toEqual({
      widthMm: 160,
      heightMm: 100,
      marginMm: 8,
    });
    expect(metrics.canvasBoundsMm).toEqual({
      minX: 0,
      minY: 0,
      maxX: 160,
      maxY: 100,
    });
    expect(outputBounds.minX).toBeGreaterThanOrEqual(8);
    expect(outputBounds.maxX).toBeLessThanOrEqual(152);
    expect(outputBounds.minY).toBeGreaterThanOrEqual(8);
    expect(outputBounds.maxY).toBeLessThanOrEqual(92);
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

  it("clips paths using an uploaded svg mask payload", () => {
    const encodedMask = encodeFilledSvgMask(6, 4, () => true);
    const maskNode = {
      id: "node-2",
      kind: "mask-svg" as const,
      position: { x: 330, y: 40 },
      config: {
        centerX: 105,
        centerY: 148.5,
        width: 120,
        height: 120,
        fitMode: "contain",
        rotationDeg: 0,
        svgMaskSourceName: "wide-block.svg",
        svgMaskDataBase64: encodedMask,
      },
    };
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "line-grid",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                width: 170,
                height: 230,
                spacing: 7,
                angleDeg: 0,
              },
            },
            maskNode,
            {
              id: "node-3",
              kind: "clip-mask",
              position: { x: 640, y: 110 },
              config: {
                mode: "clip",
              },
            },
            {
              id: "node-4",
              kind: "output-layer",
              position: { x: 960, y: 110 },
              config: {
                label: "SVG Mask",
                style: "primary",
                enabled: true,
              },
            },
          ],
          connections: [
            {
              from: { nodeId: "node-1", portId: "paths" },
              to: { nodeId: "node-3", portId: "paths" },
            },
            {
              from: { nodeId: "node-2", portId: "mask" },
              to: { nodeId: "node-3", portId: "mask" },
            },
            {
              from: { nodeId: "node-3", portId: "paths" },
              to: { nodeId: "node-4", portId: "paths" },
            },
          ],
          selectedNodeId: "node-2",
          nextNodeNumber: 5,
        },
      },
      {
        caseName: "default",
        showDebug: false,
      }
    );

    expect(document.layers).toHaveLength(1);
    expect(document.layers[0]!.paths.length).toBeGreaterThan(0);

    const outputMidpoints = segmentMidpoints(document.layers[0]!.paths);
    expect(outputMidpoints.length).toBeGreaterThan(0);
    expect(outputMidpoints.every((point) => point.x >= 45 && point.x <= 165)).toBe(true);
    expect(outputMidpoints.every((point) => point.y >= 108.5 && point.y <= 188.5)).toBe(true);

    const guides = guidePathsForNode(maskNode);
    expect(guides).toHaveLength(1);
    const guideBounds = pathBounds(guides);
    expect(guideBounds.minX).toBeCloseTo(45, 6);
    expect(guideBounds.maxX).toBeCloseTo(165, 6);
    expect(guideBounds.minY).toBeCloseTo(108.5, 6);
    expect(guideBounds.maxY).toBeCloseTo(188.5, 6);
  });

  it("renders dashed line generator nodes with thickness support", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "line",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                length: 40,
                angleDeg: 0,
                style: "dashed",
                thickness: 0.35,
                dashLength: 8,
                dashGap: 4,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 1020, y: 40 },
              config: {
                label: "Line",
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
    expect(document.layers[0]!.paths).toHaveLength(4);
  });

  it("renders embedded svg-concentric-outline nodes from node-local svg state overrides", () => {
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
                programId: "svg-concentric-outline",
                paramSetId: "",
                copies: 2,
                shrinkFactor: 0.5,
                shrinkStepMm: 0,
                sizeMm: 100,
                programStateJson: JSON.stringify({
                  sourceName: "double-line.svg",
                  paths: [
                    {
                      closed: false,
                      points: [
                        { x: 0, y: 0 },
                        { x: 40, y: 0 },
                      ],
                    },
                    {
                      closed: false,
                      points: [
                        { x: 0, y: 100 },
                        { x: 40, y: 100 },
                      ],
                    },
                  ],
                }),
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 1020, y: 40 },
              config: {
                label: "SVG Outline",
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
    expect(document.layers[0]!.paths).toHaveLength(4);
    expect(boundsCenter(pathBounds([document.layers[0]!.paths[0]!])).y).toBeCloseTo(
      boundsCenter(pathBounds([document.layers[0]!.paths[2]!])).y,
      6
    );
    expect(boundsCenter(pathBounds([document.layers[0]!.paths[1]!])).y).toBeCloseTo(
      boundsCenter(pathBounds([document.layers[0]!.paths[3]!])).y,
      6
    );
  });

  it("draws text generator nodes from bundled Google font outlines", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "text",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                text: "LC",
                fontId: "inter",
                fontSize: 18,
                fontWeight: 700,
                rotationDeg: 0,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 1020, y: 40 },
              config: {
                label: "Text",
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
    expect(document.layers[0]!.paths.length).toBeGreaterThan(1);
    expect(document.layers[0]!.paths.every((path) => path.closed === true)).toBe(true);
  });

  it("fills text nodes with hatch patterns while preserving counters", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "text",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                text: "O",
                fontId: "inter",
                fontSize: 42,
                fontWeight: 700,
                rotationDeg: 0,
                fillPattern: "cross-hatch",
                includeOutline: false,
                fillSpacing: 3,
                fillAngleDeg: 0,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 1020, y: 40 },
              config: {
                label: "Text Fill",
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

    const paths = document.layers[0]!.paths;
    const center = { x: 105, y: 148.5 };
    const nearestMidpoint = Math.min(
      ...segmentMidpoints(paths).map((point) => Math.hypot(point.x - center.x, point.y - center.y))
    );

    expect(paths.length).toBeGreaterThan(10);
    expect(paths.every((path) => path.closed !== true)).toBe(true);
    expect(nearestMidpoint).toBeGreaterThan(4);
  });

  it("supports continual inset fills for text nodes", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "text",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                text: "LC",
                fontId: "inter",
                fontSize: 28,
                fontWeight: 600,
                rotationDeg: 0,
                fillPattern: "inset",
                includeOutline: false,
                fillSpacing: 2,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 1020, y: 40 },
              config: {
                label: "Inset Fill",
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
    expect(document.layers[0]!.paths.length).toBeGreaterThan(6);
  });

  it("supports space-filling curve fills for text nodes", () => {
    const patterns = ["hilbert", "moore", "peano", "dragon"] as const;
    const pathCounts = patterns.map((fillPattern) => {
      const document = renderProgramCase(
        program,
        {
          ...defaultSet,
          programState: {
            nodes: [
              {
                id: "node-1",
                kind: "text",
                position: { x: 40, y: 40 },
                config: {
                  centerX: 105,
                  centerY: 148.5,
                  text: "LC",
                  fontId: "space-grotesk",
                  fontSize: 28,
                  fontWeight: 600,
                  rotationDeg: 0,
                  fillPattern,
                  includeOutline: false,
                  fillSpacing: 2.4,
                  fillAngleDeg: 18,
                  curveOrder: 4,
                },
              },
              {
                id: "node-2",
                kind: "output-layer",
                position: { x: 1020, y: 40 },
                config: {
                  label: "Curve Fill",
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
      expect(document.layers[0]!.paths.length).toBeGreaterThan(0);
      expect(document.layers[0]!.paths.every((path) => path.closed !== true)).toBe(true);
      return document.layers[0]!.paths.length;
    });

    expect(new Set(pathCounts).size).toBeGreaterThan(1);
  });

  it("builds guide paths for line and text nodes", () => {
    const lineGuides = guidePathsForNode({
      id: "node-1",
      kind: "line",
      position: { x: 40, y: 40 },
      config: {
        centerX: 105,
        centerY: 148.5,
        length: 40,
        angleDeg: 0,
        style: "dashed",
        thickness: 0.35,
        dashLength: 8,
        dashGap: 4,
      },
    });
    const textGuides = guidePathsForNode({
      id: "node-2",
      kind: "text",
      position: { x: 40, y: 40 },
      config: {
        centerX: 105,
        centerY: 148.5,
        text: "LC",
        fontId: "inter",
        fontSize: 18,
        fontWeight: 700,
        rotationDeg: 0,
      },
    });

    expect(lineGuides).toHaveLength(4);
    expect(textGuides.length).toBeGreaterThan(1);
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
                gridRotationDeg: 12,
                latticeAngleDeg: 60,
                rowStepRatio: 1.1,
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

  it("draws Hamilton guide nodes for the fitted base lattice", () => {
    const guides = guidePathsForNode({
      id: "node-1",
      kind: "hamilton-path",
      position: { x: 40, y: 40 },
      config: {
        centerX: 105,
        centerY: 148.5,
        width: 146,
        height: 220,
        seed: 2417,
        columns: 7,
        rows: 9,
        gridRotationDeg: 12,
        latticeAngleDeg: 60,
        rowStepRatio: 1.1,
        strokeCount: 3,
        strokeSpacing: 0.72,
        cornerRadius: 1.1,
        deflection: 0,
        drawCenterlines: false,
      },
    });

    expect(guides).toHaveLength(1 + 63);
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
                gridRotationDeg: 0,
                latticeAngleDeg: 90,
                rowStepRatio: 1,
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

  it("constrains Hamilton generation to the built-in Ona logo mask", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "mask-ona-logo",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                width: 120,
                height: 120,
                rotationDeg: 0,
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
                columns: 34,
                rows: 34,
                gridRotationDeg: 0,
                latticeAngleDeg: 90,
                rowStepRatio: 1,
                strokeCount: 1,
                strokeSpacing: 0.7,
                cornerRadius: 1,
                deflection: 0,
                drawCenterlines: false,
              },
            },
            {
              id: "node-3",
              kind: "output-layer",
              position: { x: 1020, y: 40 },
              config: {
                label: "Ona Domain",
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

    const paths = document.layers[0]?.paths ?? [];
    expect(paths.length).toBeGreaterThan(8);
    expect(
      paths.flatMap((path) => path.points).some((point) => {
        const dx = Math.abs(point.x - 105);
        const dy = Math.abs(point.y - 148.5);
        return dx < 20 && dy < 20;
      })
    ).toBe(false);
  });

  it("renders ordered Ona logo contour offsets with four pen outputs", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "ona-logo-contours",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                width: 120,
                height: 120,
                contours: 12,
                spacing: 2,
                innerContours: 12,
                innerSpacing: 2,
                lineMode: "contours",
                rotationDeg: 0,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 700, y: 40 },
              config: {
                label: "Black",
                style: "black",
                enabled: true,
              },
            },
            {
              id: "node-3",
              kind: "output-layer",
              position: { x: 700, y: 180 },
              config: {
                label: "Blue",
                style: "blue",
                enabled: true,
              },
            },
            {
              id: "node-4",
              kind: "output-layer",
              position: { x: 700, y: 320 },
              config: {
                label: "Teal",
                style: "teal",
                enabled: true,
              },
            },
            {
              id: "node-5",
              kind: "output-layer",
              position: { x: 700, y: 460 },
              config: {
                label: "Light Gray",
                style: "light-gray",
                enabled: true,
              },
            },
          ],
          connections: [
            { from: { nodeId: "node-1", portId: "pen1" }, to: { nodeId: "node-2", portId: "paths" } },
            { from: { nodeId: "node-1", portId: "pen2" }, to: { nodeId: "node-3", portId: "paths" } },
            { from: { nodeId: "node-1", portId: "pen3" }, to: { nodeId: "node-4", portId: "paths" } },
            { from: { nodeId: "node-1", portId: "pen4" }, to: { nodeId: "node-5", portId: "paths" } },
          ],
          selectedNodeId: "node-1",
          nextNodeNumber: 6,
        },
      },
      {
        caseName: "default",
        showDebug: false,
      }
    );

    expect(document.layers).toHaveLength(4);
    expect(document.layers.map((layer) => layer.paths.length)).toEqual([6, 6, 6, 6]);
    expect(document.layers.map((layer) => layer.stroke)).toEqual([
      "#111111",
      "#2563eb",
      "#14b8a6",
      "#d1d5db",
    ]);

    const allPaths = document.layers.flatMap((layer) => layer.paths);
    expect(allPaths).toHaveLength(24);
    expect(allPaths.every((path) => path.closed === true)).toBe(true);

    const firstBounds = pathBounds([document.layers[0]!.paths[0]!]);
    const lastBounds = pathBounds([document.layers[3]!.paths.at(-2)!]);
    expect(firstBounds.maxX - firstBounds.minX).toBeGreaterThan(lastBounds.maxX - lastBounds.minX);
  });

  it("allows Ona logo contour widths larger than the default A4 content width", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "ona-logo-contours",
              position: { x: 40, y: 40 },
              config: {
                centerX: 140,
                centerY: 148.5,
                width: 240,
                height: 120,
                contours: 1,
                spacing: 2,
                innerContours: 0,
                innerSpacing: 2,
                lineMode: "contours",
                rotationDeg: 0,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 700, y: 40 },
              config: {
                label: "Wide Contour",
                style: "primary",
                enabled: true,
                pageWidthMm: 280,
                pageHeightMm: 297,
                pageMarginMm: 10,
              },
            },
          ],
          connections: [
            { from: { nodeId: "node-1", portId: "paths" }, to: { nodeId: "node-2", portId: "paths" } },
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

    const bounds = pathBounds(document.layers[0]?.paths ?? []);

    expect(document.canvas.widthMm).toBe(280);
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(220);
  });

  it("can draw centerlines between fewer than eight Ona logo contours", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "ona-logo-contours",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                width: 120,
                height: 120,
                contours: 4,
                spacing: 4,
                innerContours: 4,
                innerSpacing: 4,
                lineMode: "centerlines",
                rotationDeg: 0,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 700, y: 40 },
              config: {
                label: "Centerlines",
                style: "primary",
                enabled: true,
              },
            },
          ],
          connections: [
            { from: { nodeId: "node-1", portId: "paths" }, to: { nodeId: "node-2", portId: "paths" } },
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

    const paths = document.layers[0]?.paths ?? [];
    expect(paths).toHaveLength(6);
    expect(paths.every((path) => path.closed === true)).toBe(true);

    const firstBounds = pathBounds([paths[0]!]);
    const lastBounds = pathBounds([paths.at(-2)!]);
    expect(firstBounds.maxX - firstBounds.minX).toBeGreaterThan(lastBounds.maxX - lastBounds.minX);
  });

  it("can configure Ona logo interior contours separately", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "ona-logo-contours",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                width: 120,
                height: 120,
                contours: 5,
                spacing: 2,
                innerContours: 2,
                innerSpacing: 6,
                lineMode: "contours",
                rotationDeg: 0,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 700, y: 40 },
              config: {
                label: "Contours",
                style: "primary",
                enabled: true,
              },
            },
          ],
          connections: [
            { from: { nodeId: "node-1", portId: "paths" }, to: { nodeId: "node-2", portId: "paths" } },
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

    const paths = document.layers[0]?.paths ?? [];
    expect(paths).toHaveLength(7);
    expect(paths.every((path) => path.closed === true)).toBe(true);
  });

  it("can draw the Ona logo as one continuous inward shrinking line", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "ona-logo-contours",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                width: 120,
                height: 120,
                contours: 4,
                spacing: 2,
                innerContours: 4,
                innerSpacing: 2,
                lineMode: "continuous",
                rotationDeg: 0,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 700, y: 40 },
              config: {
                label: "Continuous",
                style: "primary",
                enabled: true,
              },
            },
          ],
          connections: [
            { from: { nodeId: "node-1", portId: "paths" }, to: { nodeId: "node-2", portId: "paths" } },
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

    const paths = document.layers[0]?.paths ?? [];
    expect(paths).toHaveLength(1);
    expect(paths[0]!.closed).not.toBe(true);
    expect(paths[0]!.points).toHaveLength(1025);

    const start = paths[0]!.points[0]!;
    const end = paths[0]!.points.at(-1)!;
    expect(Math.abs(start.x - 105)).toBeGreaterThan(Math.abs(end.x - 105));
  });

  it("can connect Ona logo contours into one single-stroke path", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "ona-logo-contours",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                width: 120,
                height: 120,
                contours: 4,
                spacing: 3,
                innerContours: 0,
                innerSpacing: 3,
                lineMode: "single-stroke",
                rotationDeg: 0,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 700, y: 40 },
              config: {
                label: "Single Stroke",
                style: "primary",
                enabled: true,
              },
            },
          ],
          connections: [
            { from: { nodeId: "node-1", portId: "paths" }, to: { nodeId: "node-2", portId: "paths" } },
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
    const metrics = calculateDocumentMetrics(document);
    const paths = document.layers[0]?.paths ?? [];

    expect(paths).toHaveLength(1);
    expect(paths[0]!.closed).not.toBe(true);
    expect(paths[0]!.points.length).toBeGreaterThan(400);
    expect(metrics.pathCount).toBe(1);
    expect(metrics.penUpDistanceMm).toBe(0);
  });

  it("can sort a path stream to reduce travel before output", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "line",
              position: { x: 40, y: 40 },
              config: {
                centerX: 150,
                centerY: 50,
                length: 20,
                angleDeg: 0,
                style: "solid",
                thickness: 0.35,
                dashLength: 8,
                dashGap: 4,
              },
            },
            {
              id: "node-2",
              kind: "line",
              position: { x: 40, y: 180 },
              config: {
                centerX: 20,
                centerY: 50,
                length: 20,
                angleDeg: 0,
                style: "solid",
                thickness: 0.35,
                dashLength: 8,
                dashGap: 4,
              },
            },
            {
              id: "node-3",
              kind: "merge-paths",
              position: { x: 350, y: 90 },
              config: {},
            },
            {
              id: "node-4",
              kind: "travel-sort",
              position: { x: 600, y: 90 },
              config: {
                allowFlip: true,
                reloopClosed: true,
                mergeTolerance: 0,
              },
            },
            {
              id: "node-5",
              kind: "output-layer",
              position: { x: 850, y: 90 },
              config: {
                label: "Sorted",
                style: "primary",
                enabled: true,
              },
            },
          ],
          connections: [
            { from: { nodeId: "node-1", portId: "paths" }, to: { nodeId: "node-3", portId: "a" } },
            { from: { nodeId: "node-2", portId: "paths" }, to: { nodeId: "node-3", portId: "b" } },
            { from: { nodeId: "node-3", portId: "paths" }, to: { nodeId: "node-4", portId: "paths" } },
            { from: { nodeId: "node-4", portId: "paths" }, to: { nodeId: "node-5", portId: "paths" } },
          ],
          selectedNodeId: "node-4",
          nextNodeNumber: 6,
        },
      },
      {
        caseName: "default",
        showDebug: false,
      }
    );
    const paths = document.layers[0]?.paths ?? [];
    const firstBounds = pathBounds([paths[0]!]);
    const secondBounds = pathBounds([paths[1]!]);

    expect(paths).toHaveLength(2);
    expect(firstBounds.minX).toBeCloseTo(10, 6);
    expect(secondBounds.minX).toBeCloseTo(140, 6);
  });

  it("renders Voronoi nested cell generator nodes as closed loops", () => {
    const bounds = contentBounds(program.canvas);
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          nodes: [
            {
              id: "node-1",
              kind: "voronoi-nested-cells",
              position: { x: 40, y: 40 },
              config: {
                centerX: 105,
                centerY: 148.5,
                width: 120,
                height: 180,
                pointCount: 8,
                randomSeed: 20,
                filletRadius: 16,
                layerCount: 4,
                scaleBase: 0.88,
                rotationStep: 0.4,
              },
            },
            {
              id: "node-2",
              kind: "output-layer",
              position: { x: 1020, y: 40 },
              config: {
                label: "Voronoi",
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
    expect(document.layers[0]!.paths).toHaveLength(32);
    expect(document.layers[0]!.paths.every((path) => path.closed === true)).toBe(true);
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

  it("draws Voronoi seed guides for the configured region", () => {
    const guides = guidePathsForNode({
      id: "node-1",
      kind: "voronoi-nested-cells",
      position: { x: 40, y: 40 },
      config: {
        centerX: 105,
        centerY: 148.5,
        width: 120,
        height: 180,
        pointCount: 8,
        randomSeed: 20,
        filletRadius: 16,
        layerCount: 4,
        scaleBase: 0.88,
        rotationStep: 0.4,
      },
    });

    expect(guides).toHaveLength(9);
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
