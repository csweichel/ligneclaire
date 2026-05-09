import {
  boolParam,
  clamp,
  contentBounds,
  defineProgram,
  floatParam,
  generateHamiltonPaths,
  intParam,
  lazyEditor,
  plotPalette,
  sampleFunctionPath,
  type HamiltonPathOptions,
  type HamiltonPathResult,
  type NormalizedParams,
  type Point,
  type Polyline,
  type ProgramRenderContext,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 12,
} as const;

const content = contentBounds(canvas);
const PROGRAM_VERSION = "1.0.0";

export const hamiltonPathsParamSchema = {
  seed: intParam({
    min: 1,
    max: 999999,
    default: 2417,
    label: "Seed",
    group: "Grid",
  }),
  columns: intParam({
    min: 2,
    max: 60,
    default: 21,
    label: "Columns",
    group: "Grid",
  }),
  rows: intParam({
    min: 2,
    max: 90,
    default: 31,
    label: "Rows",
    group: "Grid",
  }),
  gridRotationDeg: floatParam({
    min: -180,
    max: 180,
    default: 0,
    step: 0.5,
    label: "Grid Rotation",
    group: "Grid",
    unit: "deg",
  }),
  latticeAngleDeg: floatParam({
    min: 15,
    max: 165,
    default: 90,
    step: 0.5,
    label: "Lattice Angle",
    group: "Grid",
    unit: "deg",
  }),
  rowStepRatio: floatParam({
    min: 0.2,
    max: 4,
    default: 1,
    step: 0.02,
    label: "Row Step Ratio",
    group: "Grid",
  }),
  strokeCount: intParam({
    min: 1,
    max: 12,
    default: 3,
    label: "Parallel Strokes",
    group: "Stroke",
  }),
  strokeSpacing: floatParam({
    min: 0.2,
    max: 12,
    default: 0.62,
    step: 0.02,
    label: "Stroke Gap",
    group: "Stroke",
    unit: "mm",
  }),
  cornerRadius: floatParam({
    min: 0,
    max: 24,
    default: 1.1,
    step: 0.05,
    label: "Corner Radius",
    group: "Stroke",
    unit: "mm",
  }),
  deflection: floatParam({
    min: 0,
    max: 8,
    default: 0,
    step: 0.05,
    label: "Deflection",
    group: "Stroke",
    unit: "mm",
  }),
  drawCenterlines: boolParam({
    default: false,
    label: "Draw Centerlines",
    group: "Stroke",
  }),
} as const;

export type HamiltonPathsSchema = typeof hamiltonPathsParamSchema;
export type HamiltonPathsParams = NormalizedParams<HamiltonPathsSchema>;
export type HamiltonNodeOffsetMap = Readonly<Record<string, Point>>;
export type HamiltonPathsProgramState = Readonly<{
  nodeOffsets: HamiltonNodeOffsetMap;
  selectedNodeId: string | null;
}>;
export type HamiltonEditableNode = Readonly<{
  id: string;
  row: number;
  col: number;
  base: Point;
  position: Point;
  moved: boolean;
}>;

type HamiltonPathsRenderContext = ProgramRenderContext<
  HamiltonPathsSchema,
  HamiltonPathsProgramState
>;

function addPoint(left: Point, right: Point): Point {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  };
}

function subtractPoint(left: Point, right: Point): Point {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
  };
}

function offsetMagnitude(offset: Point | undefined): number {
  return offset ? Math.hypot(offset.x, offset.y) : 0;
}

function normalizeOffset(base: Point, offset: Point): Point | null {
  const clampedPosition = {
    x: clamp(base.x + offset.x, content.minX, content.maxX),
    y: clamp(base.y + offset.y, content.minY, content.maxY),
  };
  const normalizedOffset = subtractPoint(clampedPosition, base);

  return offsetMagnitude(normalizedOffset) < 1e-6 ? null : normalizedOffset;
}

function hamiltonBaseOptions(params: HamiltonPathsParams): HamiltonPathOptions {
  return {
    rows: params.rows,
    cols: params.columns,
    seed: 1,
    strokeCount: params.strokeCount,
    strokeSpacing: params.strokeSpacing,
    drawCenterlines: params.drawCenterlines,
    deflection: params.deflection,
    gridRotationDeg: params.gridRotationDeg,
    latticeAngleDeg: params.latticeAngleDeg,
    rowStepRatio: params.rowStepRatio,
    mixSteps: 0,
  };
}

function hamiltonRenderOptions(params: HamiltonPathsParams): HamiltonPathOptions {
  return {
    rows: params.rows,
    cols: params.columns,
    seed: params.seed,
    strokeCount: params.strokeCount,
    strokeSpacing: params.strokeSpacing,
    drawCenterlines: params.drawCenterlines,
    cornerRadius: params.cornerRadius,
    deflection: params.deflection,
    gridRotationDeg: params.gridRotationDeg,
    latticeAngleDeg: params.latticeAngleDeg,
    rowStepRatio: params.rowStepRatio,
  };
}

export function hamiltonNodeId(row: number, col: number): string {
  return `node:${row}:${col}`;
}

function parseHamiltonNodeId(id: string): Readonly<{ row: number; col: number }> | null {
  const match = /^node:(\d+):(\d+)$/.exec(id);
  if (!match) {
    return null;
  }

  return {
    row: Number.parseInt(match[1]!, 10),
    col: Number.parseInt(match[2]!, 10),
  };
}

function nodeIndex(params: HamiltonPathsParams, nodeId: string): number | null {
  const parsed = parseHamiltonNodeId(nodeId);
  if (!parsed) {
    return null;
  }
  if (
    parsed.row < 0 ||
    parsed.row >= params.rows ||
    parsed.col < 0 ||
    parsed.col >= params.columns
  ) {
    return null;
  }

  return parsed.row * params.columns + parsed.col;
}

export function defaultHamiltonProgramState(): HamiltonPathsProgramState {
  return {
    nodeOffsets: {},
    selectedNodeId: null,
  };
}

export function buildHamiltonBaseLayout(params: HamiltonPathsParams): HamiltonPathResult {
  return generateHamiltonPaths(content, hamiltonBaseOptions(params));
}

function renderNodeOffsets(
  params: HamiltonPathsParams,
  programState: HamiltonPathsProgramState
): Readonly<Record<number, Point>> {
  const offsets: Record<number, Point> = {};

  for (const [id, offset] of Object.entries(programState.nodeOffsets)) {
    const index = nodeIndex(params, id);
    if (index === null) {
      continue;
    }

    offsets[index] = offset;
  }

  return offsets;
}

export function buildHamiltonResult(
  params: HamiltonPathsParams,
  programState: HamiltonPathsProgramState = defaultHamiltonProgramState()
): HamiltonPathResult {
  return generateHamiltonPaths(content, {
    ...hamiltonRenderOptions(params),
    nodeOffsets: renderNodeOffsets(params, programState),
  });
}

export function buildHamiltonEditableNodes(
  params: HamiltonPathsParams,
  programState: HamiltonPathsProgramState
): readonly HamiltonEditableNode[] {
  const baseLayout = buildHamiltonBaseLayout(params);

  return baseLayout.baseNodes.map((base, index) => {
    const row = Math.floor(index / params.columns);
    const col = index % params.columns;
    const id = hamiltonNodeId(row, col);
    const offset = programState.nodeOffsets[id];
    const position = offset ? addPoint(base, offset) : base;

    return {
      id,
      row,
      col,
      base,
      position,
      moved: offsetMagnitude(offset) >= 1e-6,
    };
  });
}

function normalizeNodeOffsets(
  input: unknown,
  params: HamiltonPathsParams
): HamiltonNodeOffsetMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const baseLayout = buildHamiltonBaseLayout(params);
  const offsets: Record<string, Point> = {};

  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    const index = nodeIndex(params, id);
    if (index === null) {
      continue;
    }

    const base = baseLayout.baseNodes[index];
    if (!base || !value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.x !== "number" ||
      !Number.isFinite(candidate.x) ||
      typeof candidate.y !== "number" ||
      !Number.isFinite(candidate.y)
    ) {
      continue;
    }

    const normalized = normalizeOffset(base, {
      x: candidate.x,
      y: candidate.y,
    });
    if (!normalized) {
      continue;
    }

    offsets[id] = normalized;
  }

  return offsets;
}

export function normalizeHamiltonProgramState(
  input: unknown,
  params: HamiltonPathsParams
): HamiltonPathsProgramState {
  const fallback = defaultHamiltonProgramState();

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fallback;
  }

  const candidate = input as Record<string, unknown>;
  const nodeOffsets = normalizeNodeOffsets(candidate.nodeOffsets, params);
  const selectedNodeId =
    typeof candidate.selectedNodeId === "string" && nodeIndex(params, candidate.selectedNodeId) !== null
      ? candidate.selectedNodeId
      : null;

  return {
    nodeOffsets,
    selectedNodeId,
  };
}

export function selectHamiltonRenderProgramState(
  programState: HamiltonPathsProgramState
): Readonly<{
  nodeOffsets: HamiltonNodeOffsetMap;
}> {
  return {
    nodeOffsets: programState.nodeOffsets,
  };
}

export function selectHamiltonNode(
  current: HamiltonPathsProgramState,
  nodeId: string | null
): HamiltonPathsProgramState {
  if (current.selectedNodeId === nodeId) {
    return current;
  }

  return {
    ...current,
    selectedNodeId: nodeId,
  };
}

export function moveHamiltonNode(
  current: HamiltonPathsProgramState,
  nodeId: string,
  base: Point,
  nextPosition: Point
): HamiltonPathsProgramState {
  const nextOffsets = { ...current.nodeOffsets };
  const normalized = normalizeOffset(base, subtractPoint(nextPosition, base));
  if (normalized) {
    nextOffsets[nodeId] = normalized;
  } else {
    delete nextOffsets[nodeId];
  }

  return {
    nodeOffsets: nextOffsets,
    selectedNodeId: nodeId,
  };
}

export function moveHamiltonNodeForParams(
  current: HamiltonPathsProgramState,
  params: HamiltonPathsParams,
  nodeId: string,
  nextPosition: Point
): HamiltonPathsProgramState {
  const index = nodeIndex(params, nodeId);
  if (index === null) {
    return current;
  }

  const base = buildHamiltonBaseLayout(params).baseNodes[index];
  if (!base) {
    return current;
  }

  return moveHamiltonNode(current, nodeId, base, nextPosition);
}

export function clearHamiltonNodeOffset(
  current: HamiltonPathsProgramState,
  nodeId: string
): HamiltonPathsProgramState {
  if (!(nodeId in current.nodeOffsets)) {
    return current.selectedNodeId === nodeId
      ? {
          ...current,
          selectedNodeId: nodeId,
        }
      : current;
  }

  const nextOffsets = { ...current.nodeOffsets };
  delete nextOffsets[nodeId];

  return {
    nodeOffsets: nextOffsets,
    selectedNodeId: nodeId,
  };
}

export function clearHamiltonNodeOffsets(
  current: HamiltonPathsProgramState
): HamiltonPathsProgramState {
  if (Object.keys(current.nodeOffsets).length === 0 && current.selectedNodeId === null) {
    return current;
  }

  return {
    nodeOffsets: {},
    selectedNodeId: null,
  };
}

function makeCirclePath(centerX: number, centerY: number, radius: number, segments = 24): Polyline {
  return sampleFunctionPath(
    (amount) => {
      const angle = amount * Math.PI * 2;
      return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
    },
    0,
    1,
    segments
  );
}

export const program = defineProgram({
  id: "hamilton-paths",
  title: "Hamilton Paths",
  description:
    "A seeded Hamiltonian walk across a configurable lattice, with draggable per-node adjustments and parallel strokes.",
  version: PROGRAM_VERSION,
  canvas,
  params: hamiltonPathsParamSchema,
  defaultProgramState: defaultHamiltonProgramState,
  normalizeProgramState: (input, ctx) =>
    normalizeHamiltonProgramState(input, ctx.params),
  selectRenderProgramState: selectHamiltonRenderProgramState,
  validation: {
    cases: ["default"],
  },
  editor: lazyEditor(() => import("./editor")),
  render(ctx: HamiltonPathsRenderContext) {
    const result = buildHamiltonResult(ctx.params, ctx.programState);
    const debugRadius = Math.max(
      0.35,
      Math.min(result.cellSize * Math.min(1, ctx.params.rowStepRatio) * 0.18, 1.6)
    );

    return {
      canvas,
      layers: [
        {
          id: "hamilton-paths",
          label: "Hamilton Paths",
          stroke: plotPalette.primary,
          paths: result.paths,
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "hamilton-base-nodes",
              label: "Base Nodes",
              stroke: plotPalette.mask,
              paths: result.baseNodes.map((point) =>
                makeCirclePath(point.x, point.y, debugRadius)
              ),
            },
          ]
        : undefined,
      metadata: {
        programId: "hamilton-paths",
        version: PROGRAM_VERSION,
        mode: ctx.mode,
      },
    };
  },
});
