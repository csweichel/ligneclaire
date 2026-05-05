import {
  chooseTileGrid,
  contentBounds,
  createTileGrid,
  debugTileGrid,
  defineProgram,
  generateTileKinds,
  generateTilepaths,
  intParam,
  lazyEditor,
  normalizeTileRotation,
  type NormalizedParams,
  type TileGrid,
  type TileKind,
  type TilepathResult,
} from "@ligneclaire/sdk";

const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 5,
} as const;

export const tilepathGridParamSchema = {
  tile: intParam({
    min: 5,
    max: 60,
    default: 25,
    label: "Target Tile",
    group: "Grid",
    unit: "mm",
  }),
  arc: intParam({
    min: 0,
    max: 100,
    default: 35,
    label: "Arc Preference",
    group: "Grid",
  }),
  lanes: intParam({
    min: 1,
    max: 24,
    default: 9,
    label: "Lanes",
    group: "Stroke",
  }),
  segments: intParam({
    min: 4,
    max: 72,
    default: 18,
    label: "Arc Segments",
    group: "Stroke",
  }),
  passes: intParam({
    min: 1,
    max: 24,
    default: 4,
    label: "Search Passes",
    group: "Solver",
  }),
  restarts: intParam({
    min: 1,
    max: 120,
    default: 8,
    label: "Search Restarts",
    group: "Solver",
  }),
  seed: intParam({
    min: 1,
    max: 9999,
    default: 17,
    label: "Seed",
    group: "Solver",
  }),
} as const;

export type TilepathGridSchema = typeof tilepathGridParamSchema;
export type TilepathGridParams = NormalizedParams<TilepathGridSchema>;

export type TileCellOverride = Readonly<{
  kind: TileKind;
  rotation: number;
}>;

export type TilepathGridProgramState = Readonly<{
  cells: Readonly<Record<string, TileCellOverride>>;
}>;

type TileTool = Readonly<{
  id: string;
  label: string;
  short: string;
  clear?: boolean;
  kind?: TileKind;
  rotation?: number;
}>;

export const tileTools = [
  {
    id: "unset",
    label: "Unset",
    short: "·",
    clear: true,
  },
  {
    id: "line-h",
    label: "Line Horizontal",
    short: "L-",
    kind: "line",
    rotation: 0,
  },
  {
    id: "line-v",
    label: "Line Vertical",
    short: "L|",
    kind: "line",
    rotation: 1,
  },
  {
    id: "arc-sw",
    label: "Arc South West",
    short: "ASW",
    kind: "arc",
    rotation: 0,
  },
  {
    id: "arc-nw",
    label: "Arc North West",
    short: "ANW",
    kind: "arc",
    rotation: 1,
  },
  {
    id: "arc-ne",
    label: "Arc North East",
    short: "ANE",
    kind: "arc",
    rotation: 2,
  },
  {
    id: "arc-se",
    label: "Arc South East",
    short: "ASE",
    kind: "arc",
    rotation: 3,
  },
] as const satisfies readonly TileTool[];

function defaultProgramState(): TilepathGridProgramState {
  return {
    cells: {},
  };
}

function isTileKind(value: unknown): value is TileKind {
  return value === "line" || value === "arc";
}

export function cellId(row: number, col: number): string {
  return `cell:${row}:${col}`;
}

function parseCellId(id: string): Readonly<{ row: number; col: number }> | null {
  const match = /^cell:(\d+):(\d+)$/.exec(id);
  if (!match) {
    return null;
  }

  return {
    row: Number.parseInt(match[1]!, 10),
    col: Number.parseInt(match[2]!, 10),
  };
}

export function findTileTool(id: string): TileTool | null {
  return tileTools.find((tool) => tool.id === id) ?? null;
}

export function toolForKindRotation(kind: TileKind, rotation: number): TileTool {
  const normalizedRotation = normalizeTileRotation(kind, rotation);
  return (
    tileTools.find(
      (tool) =>
        "kind" in tool &&
        tool.kind === kind &&
        normalizeTileRotation(kind, tool.rotation ?? 0) === normalizedRotation
    ) ?? tileTools[0]
  );
}

export function toolForOverride(override: TileCellOverride | undefined): TileTool | null {
  if (!override) {
    return null;
  }

  return toolForKindRotation(override.kind, override.rotation);
}

export function applyToolToState(
  current: TilepathGridProgramState,
  targetCellId: string,
  toolId: string
): TilepathGridProgramState {
  const tool = findTileTool(toolId);
  if (!tool) {
    return current;
  }

  const nextCells = { ...current.cells };
  if (tool.clear) {
    delete nextCells[targetCellId];
  } else {
    nextCells[targetCellId] = {
      kind: tool.kind ?? "line",
      rotation: normalizeTileRotation(tool.kind ?? "line", tool.rotation ?? 0),
    };
  }

  return {
    cells: nextCells,
  };
}

export type TilepathGridLayout = Readonly<{
  bounds: ReturnType<typeof contentBounds>;
  rows: number;
  cols: number;
  tileSize: number;
  grid: TileGrid;
  result: TilepathResult;
}>;

export function buildTilepathLayout(
  params: TilepathGridParams,
  programState: TilepathGridProgramState
): TilepathGridLayout {
  const bounds = contentBounds(canvas);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const gridChoice = chooseTileGrid({ width, height }, params.tile);
  const tiles = [...generateTileKinds(gridChoice.rows, gridChoice.cols, params.seed, params.arc)];
  const lockedRotations: Record<number, number> = {};

  for (const [id, override] of Object.entries(programState.cells)) {
    const parsed = parseCellId(id);
    if (!parsed) {
      continue;
    }

    if (parsed.row < 0 || parsed.row >= gridChoice.rows || parsed.col < 0 || parsed.col >= gridChoice.cols) {
      continue;
    }

    const index = parsed.row * gridChoice.cols + parsed.col;
    tiles[index] = override.kind;
    lockedRotations[index] = normalizeTileRotation(override.kind, override.rotation);
  }

  const grid = createTileGrid(gridChoice.rows, gridChoice.cols, tiles);
  const result = generateTilepaths(bounds, grid, {
    lanes: params.lanes,
    arcSegments: params.segments,
    searchPasses: params.passes,
    searchRestarts: params.restarts,
    seed: params.seed,
    tileSize: gridChoice.tileSize,
    lockedRotations,
  });

  return {
    bounds,
    rows: gridChoice.rows,
    cols: gridChoice.cols,
    tileSize: gridChoice.tileSize,
    grid,
    result,
  };
}

function normalizeProgramState(input: unknown): TilepathGridProgramState {
  if (!input || typeof input !== "object") {
    return defaultProgramState();
  }

  const cellsValue = (input as Record<string, unknown>).cells;
  if (!cellsValue || typeof cellsValue !== "object") {
    return defaultProgramState();
  }

  const cells: Record<string, TileCellOverride> = {};
  for (const [id, value] of Object.entries(cellsValue as Record<string, unknown>)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const override = value as Record<string, unknown>;
    if (!isTileKind(override.kind)) {
      continue;
    }

    const rotationCandidate =
      typeof override.rotation === "number" && Number.isFinite(override.rotation)
        ? override.rotation
        : 0;
    cells[id] = {
      kind: override.kind,
      rotation: normalizeTileRotation(override.kind, rotationCandidate),
    };
  }

  return {
    cells,
  };
}

export const program = defineProgram({
  id: "tilepath-grid",
  title: "Tilepath Grid",
  description: "A routed arc-and-line tile field with cell-level studio overrides.",
  version: "1.0.0",
  canvas,
  params: tilepathGridParamSchema,
  validation: {
    cases: ["default"],
  },
  editor: lazyEditor(() => import("./editor")),
  defaultProgramState,
  normalizeProgramState,
  render(ctx) {
    const layout = buildTilepathLayout(ctx.params, ctx.programState);

    return {
      canvas,
      layers: [
        {
          id: "tilepath-grid",
          label: "Tilepath Grid",
          stroke: "#0f172a",
          paths: layout.result.paths,
        },
      ],
      debugLayers: ctx.showDebug
        ? [
            {
              id: "tile-grid",
              label: "Tile Grid",
              stroke: "#1d4ed8",
              paths: debugTileGrid(layout.grid, layout.result),
            },
          ]
        : undefined,
      metadata: {
        programId: "tilepath-grid",
        version: "1.0.0",
        mode: ctx.mode,
      },
    };
  },
});
