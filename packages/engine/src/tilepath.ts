import type { Bounds, Point, Polyline } from "./document";

export type TileKind = "arc" | "line";

export type TileGrid = Readonly<{
  rows: number;
  cols: number;
  tiles: readonly TileKind[];
}>;

export type TilepathOptions = Readonly<{
  lanes?: number;
  arcSegments?: number;
  searchPasses?: number;
  searchRestarts?: number;
  seed?: number;
  tileSize?: number;
  lockedRotations?: Readonly<Record<number, number>>;
  rotations?: readonly number[];
}>;

export type TilepathResult = Readonly<{
  rotations: readonly number[];
  paths: readonly Polyline[];
  componentSizes: readonly number[];
  score: number;
  cellSize: number;
  origin: Point;
  rows: number;
  cols: number;
}>;

type Edge = "north" | "east" | "south" | "west";

type Port = Readonly<{
  edge: Edge;
  slot: number;
}>;

type PortRef = Readonly<{
  strand: number;
  end: 0 | 1;
}>;

type Strand = Readonly<{
  ports: readonly [Port, Port];
  points: readonly Point[];
}>;

type Shape = Readonly<{
  strands: readonly Strand[];
  portLookup: ReadonlyMap<string, PortRef>;
}>;

type StrandInstance = Readonly<{
  points: readonly Point[];
  neighbors: readonly [NeighborRef, NeighborRef];
}>;

type NeighborRef = Readonly<{
  strand: number;
  port: 0 | 1;
  valid: boolean;
}>;

const DEFAULT_OPTIONS = {
  lanes: 8,
  arcSegments: 12,
  searchPasses: 8,
  searchRestarts: 24,
  seed: 1,
} as const;

function normalizeOptions(options: TilepathOptions): Required<TilepathOptions> {
  return {
    lanes: Math.max(1, Math.floor(options.lanes ?? DEFAULT_OPTIONS.lanes)),
    arcSegments: Math.max(4, Math.floor(options.arcSegments ?? DEFAULT_OPTIONS.arcSegments)),
    searchPasses: Math.max(1, Math.floor(options.searchPasses ?? DEFAULT_OPTIONS.searchPasses)),
    searchRestarts: Math.max(1, Math.floor(options.searchRestarts ?? DEFAULT_OPTIONS.searchRestarts)),
    seed: Math.max(1, Math.floor(options.seed ?? DEFAULT_OPTIONS.seed)),
    tileSize: options.tileSize ?? 0,
    lockedRotations: options.lockedRotations ?? {},
    rotations: options.rotations ? [...options.rotations] : [],
  };
}

function tileIndex(grid: TileGrid, row: number, col: number): number {
  return row * grid.cols + col;
}

function createSeededRng(seed: number): () => number {
  let current = seed >>> 0;

  return () => {
    current = (current + 0x6d2b79f5) >>> 0;
    let value = current;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<Value>(values: Value[], next: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!];
  }
}

function portKey(port: Port): string {
  return `${port.edge}:${port.slot}`;
}

export function createTileGrid(rows: number, cols: number, tiles: readonly TileKind[]): TileGrid {
  if (rows <= 0 || cols <= 0) {
    throw new Error("rows and cols must be positive");
  }

  if (tiles.length !== rows * cols) {
    throw new Error(`need ${rows * cols} tiles, got ${tiles.length}`);
  }

  return {
    rows,
    cols,
    tiles: [...tiles],
  };
}

export function normalizeTileRotation(kind: TileKind, rotation: number): number {
  if (kind === "line") {
    const normalized = rotation % 2;
    return normalized < 0 ? normalized + 2 : normalized;
  }

  const normalized = rotation % 4;
  return normalized < 0 ? normalized + 4 : normalized;
}

function allowedRotations(kind: TileKind): readonly number[] {
  return kind === "line" ? [0, 1] : [0, 1, 2, 3];
}

function fitGrid(bounds: Bounds, grid: TileGrid, options: Required<TilepathOptions>): Readonly<{
  cellSize: number;
  origin: Point;
}> {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  if (options.tileSize > 0) {
    const cellSize = options.tileSize;
    if (cellSize * grid.cols > width || cellSize * grid.rows > height) {
      throw new Error("tile size does not fit the requested grid into the provided bounds");
    }

    return {
      cellSize,
      origin: {
        x: bounds.minX,
        y: bounds.minY,
      },
    };
  }

  const cellSize = Math.floor(Math.min(width / grid.cols, height / grid.rows));
  if (cellSize <= 0) {
    throw new Error("bounds are too small for the requested tile grid");
  }

  const gridWidth = cellSize * grid.cols;
  const gridHeight = cellSize * grid.rows;

  return {
    cellSize,
    origin: {
      x: bounds.minX + (width - gridWidth) * 0.5,
      y: bounds.minY + (height - gridHeight) * 0.5,
    },
  };
}

function slotPosition(index: number, lanes: number, size: number): number {
  return ((index + 1) * size) / (lanes + 1);
}

function quarterArc(
  center: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number
): Point[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const amount = index / segments;
    const angle = startAngle + (endAngle - startAngle) * amount;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
}

function rotatePoint(point: Point, size: number, rotation: number): Point {
  let result = { ...point };

  for (let index = 0; index < rotation % 4; index += 1) {
    result = {
      x: result.y,
      y: size - result.x,
    };
  }

  return result;
}

function rotatePoints(points: readonly Point[], size: number, rotation: number): Point[] {
  return points.map((point) => rotatePoint(point, size, rotation));
}

function rotatePort(port: Port, lanes: number, rotation: number): Port {
  let result = port;

  for (let index = 0; index < rotation % 4; index += 1) {
    switch (result.edge) {
      case "north":
        result = { edge: "east", slot: lanes - 1 - result.slot };
        break;
      case "east":
        result = { edge: "south", slot: result.slot };
        break;
      case "south":
        result = { edge: "west", slot: lanes - 1 - result.slot };
        break;
      case "west":
        result = { edge: "north", slot: result.slot };
        break;
    }
  }

  return result;
}

function baseStrands(kind: TileKind, lanes: number, size: number, arcSegments: number): Strand[] {
  return Array.from({ length: lanes }, (_, index) => {
    const slot = slotPosition(index, lanes, size);

    if (kind === "line") {
      return {
        ports: [
          { edge: "west", slot: index },
          { edge: "east", slot: index },
        ],
        points: [
          { x: 0, y: slot },
          { x: size, y: slot },
        ],
      };
    }

    return {
      ports: [
        { edge: "south", slot: index },
        { edge: "west", slot: index },
      ],
      points: quarterArc({ x: 0, y: 0 }, slot, 0, Math.PI / 2, arcSegments),
    };
  });
}

function precomputeShapes(options: Required<TilepathOptions>, size: number): Readonly<Record<TileKind, readonly [Shape, Shape, Shape, Shape]>> {
  const result = {
    arc: [] as unknown as [Shape, Shape, Shape, Shape],
    line: [] as unknown as [Shape, Shape, Shape, Shape],
  };

  (["arc", "line"] as const).forEach((kind) => {
    const base = baseStrands(kind, options.lanes, size, options.arcSegments);
    const rotations = [] as Shape[];

    for (let rotation = 0; rotation < 4; rotation += 1) {
      const strands = base.map((strand) => ({
        ports: [
          rotatePort(strand.ports[0], options.lanes, rotation),
          rotatePort(strand.ports[1], options.lanes, rotation),
        ] as const,
        points: rotatePoints(strand.points, size, rotation),
      }));
      const lookup = new Map<string, PortRef>();

      strands.forEach((strand, strandIndex) => {
        lookup.set(portKey(strand.ports[0]), { strand: strandIndex, end: 0 });
        lookup.set(portKey(strand.ports[1]), { strand: strandIndex, end: 1 });
      });

      rotations.push({
        strands,
        portLookup: lookup,
      });
    }

    result[kind] = rotations as [Shape, Shape, Shape, Shape];
  });

  return result;
}

function randomRotations(
  grid: TileGrid,
  next: () => number,
  lockedRotations: Readonly<Record<number, number>>
): number[] {
  return grid.tiles.map((kind, index) => {
    const locked = lockedRotations[index];
    if (locked !== undefined) {
      return normalizeTileRotation(kind, locked);
    }

    const allowed = allowedRotations(kind);
    return allowed[Math.floor(next() * allowed.length)]!;
  });
}

type UnionFind = Readonly<{
  parent: number[];
  size: number[];
}>;

function createUnionFind(size: number): UnionFind {
  return {
    parent: Array.from({ length: size }, (_, index) => index),
    size: Array.from({ length: size }, () => 1),
  };
}

function findRoot(unionFind: UnionFind, index: number): number {
  if (unionFind.parent[index] !== index) {
    unionFind.parent[index] = findRoot(unionFind, unionFind.parent[index]!);
  }

  return unionFind.parent[index]!;
}

function unionSets(unionFind: UnionFind, left: number, right: number): void {
  let leftRoot = findRoot(unionFind, left);
  let rightRoot = findRoot(unionFind, right);
  if (leftRoot === rightRoot) {
    return;
  }

  if (unionFind.size[leftRoot]! < unionFind.size[rightRoot]!) {
    [leftRoot, rightRoot] = [rightRoot, leftRoot];
  }

  unionFind.parent[rightRoot] = leftRoot;
  unionFind.size[leftRoot] = unionFind.size[leftRoot]! + unionFind.size[rightRoot]!;
}

function scoreLayout(
  grid: TileGrid,
  lanes: number,
  rotations: readonly number[],
  shapes: Readonly<Record<TileKind, readonly [Shape, Shape, Shape, Shape]>>
): Readonly<{
  score: number;
  componentSizes: readonly number[];
}> {
  const totalStrands = grid.rows * grid.cols * lanes;
  const unionFind = createUnionFind(totalStrands);

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const currentIndex = tileIndex(grid, row, col);
      const currentShape = shapes[grid.tiles[currentIndex]!][rotations[currentIndex]!]!;
      const currentBase = currentIndex * lanes;

      if (col + 1 < grid.cols) {
        const rightIndex = tileIndex(grid, row, col + 1);
        const rightShape = shapes[grid.tiles[rightIndex]!][rotations[rightIndex]!]!;
        const rightBase = rightIndex * lanes;

        for (let slot = 0; slot < lanes; slot += 1) {
          const leftPort = currentShape.portLookup.get(portKey({ edge: "east", slot }));
          const rightPort = rightShape.portLookup.get(portKey({ edge: "west", slot }));
          if (!leftPort || !rightPort) {
            continue;
          }

          unionSets(unionFind, currentBase + leftPort.strand, rightBase + rightPort.strand);
        }
      }

      if (row + 1 < grid.rows) {
        const downIndex = tileIndex(grid, row + 1, col);
        const downShape = shapes[grid.tiles[downIndex]!][rotations[downIndex]!]!;
        const downBase = downIndex * lanes;

        for (let slot = 0; slot < lanes; slot += 1) {
          const topPort = currentShape.portLookup.get(portKey({ edge: "south", slot }));
          const bottomPort = downShape.portLookup.get(portKey({ edge: "north", slot }));
          if (!topPort || !bottomPort) {
            continue;
          }

          unionSets(unionFind, currentBase + topPort.strand, downBase + bottomPort.strand);
        }
      }
    }
  }

  const counts = new Map<number, number>();
  for (let index = 0; index < totalStrands; index += 1) {
    const root = findRoot(unionFind, index);
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }

  const componentSizes = [...counts.values()].sort((left, right) => right - left);
  const score = componentSizes.reduce((total, size) => total + size * size, 0);

  return {
    score,
    componentSizes,
  };
}

function solveRotations(
  grid: TileGrid,
  options: Required<TilepathOptions>,
  shapes: Readonly<Record<TileKind, readonly [Shape, Shape, Shape, Shape]>>
): Readonly<{
  rotations: readonly number[];
  score: number;
  componentSizes: readonly number[];
}> {
  const next = createSeededRng(options.seed);
  const cellCount = grid.rows * grid.cols;
  let bestRotations = Array.from({ length: cellCount }, () => 0);
  let bestScore = -1;
  let bestComponentSizes: readonly number[] = [];
  let bestSeen = 0;

  for (let restart = 0; restart < options.searchRestarts; restart += 1) {
    const rotations = randomRotations(grid, next, options.lockedRotations);
    let { score } = scoreLayout(grid, options.lanes, rotations, shapes);
    const order = Array.from({ length: cellCount }, (_, index) => index);

    for (let pass = 0; pass < options.searchPasses; pass += 1) {
      let changed = false;
      let improved = false;
      shuffleInPlace(order, next);

      for (const index of order) {
        if (options.lockedRotations[index] !== undefined) {
          continue;
        }

        const current = rotations[index]!;
        let bestLocalScore = score;
        let bestLocalRotations = [current];
        const allowed = [...allowedRotations(grid.tiles[index]!)];
        shuffleInPlace(allowed, next);

        for (const candidate of allowed) {
          if (candidate === current) {
            continue;
          }

          rotations[index] = candidate;
          const candidateScore = scoreLayout(grid, options.lanes, rotations, shapes).score;

          if (candidateScore > bestLocalScore) {
            bestLocalScore = candidateScore;
            bestLocalRotations = [candidate];
          } else if (candidateScore === bestLocalScore) {
            bestLocalRotations.push(candidate);
          }
        }

        const choice = bestLocalRotations[Math.floor(next() * bestLocalRotations.length)]!;
        rotations[index] = choice;
        if (choice !== current) {
          changed = true;
        }
        if (bestLocalScore > score) {
          score = bestLocalScore;
          improved = true;
        }
      }

      if (!changed && !improved) {
        break;
      }
    }

    const finalScore = scoreLayout(grid, options.lanes, rotations, shapes);
    if (finalScore.score > bestScore) {
      bestRotations = [...rotations];
      bestScore = finalScore.score;
      bestComponentSizes = [...finalScore.componentSizes];
      bestSeen = 1;
      continue;
    }

    if (finalScore.score === bestScore) {
      bestSeen += 1;
      if (Math.floor(next() * bestSeen) === 0) {
        bestRotations = [...rotations];
        bestComponentSizes = [...finalScore.componentSizes];
      }
    }
  }

  return {
    rotations: bestRotations,
    score: bestScore,
    componentSizes: bestComponentSizes,
  };
}

function translatePoints(points: readonly Point[], offset: Point): Point[] {
  return points.map((point) => ({
    x: point.x + offset.x,
    y: point.y + offset.y,
  }));
}

function makeNeighbor(strand: number, port: 0 | 1): NeighborRef {
  return {
    strand,
    port,
    valid: true,
  };
}

function buildInstances(
  grid: TileGrid,
  options: Required<TilepathOptions>,
  cellSize: number,
  origin: Point,
  rotations: readonly number[],
  shapes: Readonly<Record<TileKind, readonly [Shape, Shape, Shape, Shape]>>
): StrandInstance[] {
  const total = grid.rows * grid.cols * options.lanes;
  const instances: {
    points: readonly Point[];
    neighbors: [NeighborRef, NeighborRef];
  }[] = Array.from({ length: total }, () => ({
    points: [],
    neighbors: [
      { strand: -1, port: 0, valid: false },
      { strand: -1, port: 0, valid: false },
    ],
  }));
  const portMaps: Array<ReadonlyMap<string, PortRef>> = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const cellIndex = tileIndex(grid, row, col);
      const shape = shapes[grid.tiles[cellIndex]!][rotations[cellIndex]!]!;
      portMaps[cellIndex] = shape.portLookup;
      const offset = tileCellOrigin({ cellSize, origin, rows: grid.rows, cols: grid.cols }, row, col);
      const base = cellIndex * options.lanes;

      shape.strands.forEach((strand, strandIndex) => {
        instances[base + strandIndex] = {
          points: translatePoints(strand.points, offset),
          neighbors: [
            { strand: -1, port: 0, valid: false },
            { strand: -1, port: 0, valid: false },
          ],
        };
      });
    }
  }

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const cellIndex = tileIndex(grid, row, col);
      const base = cellIndex * options.lanes;

      if (col + 1 < grid.cols) {
        const rightIndex = tileIndex(grid, row, col + 1);
        const rightBase = rightIndex * options.lanes;

        for (let slot = 0; slot < options.lanes; slot += 1) {
          const leftPort = portMaps[cellIndex]?.get(portKey({ edge: "east", slot }));
          const rightPort = portMaps[rightIndex]?.get(portKey({ edge: "west", slot }));
          if (!leftPort || !rightPort) {
            continue;
          }

          instances[base + leftPort.strand]!.neighbors[leftPort.end] = makeNeighbor(
            rightBase + rightPort.strand,
            rightPort.end
          );
          instances[rightBase + rightPort.strand]!.neighbors[rightPort.end] = makeNeighbor(
            base + leftPort.strand,
            leftPort.end
          );
        }
      }

      if (row + 1 < grid.rows) {
        const downIndex = tileIndex(grid, row + 1, col);
        const downBase = downIndex * options.lanes;

        for (let slot = 0; slot < options.lanes; slot += 1) {
          const topPort = portMaps[cellIndex]?.get(portKey({ edge: "south", slot }));
          const bottomPort = portMaps[downIndex]?.get(portKey({ edge: "north", slot }));
          if (!topPort || !bottomPort) {
            continue;
          }

          instances[base + topPort.strand]!.neighbors[topPort.end] = makeNeighbor(
            downBase + bottomPort.strand,
            bottomPort.end
          );
          instances[downBase + bottomPort.strand]!.neighbors[bottomPort.end] = makeNeighbor(
            base + topPort.strand,
            topPort.end
          );
        }
      }
    }
  }

  return instances as StrandInstance[];
}

function almostEqualPoint(left: Point, right: Point): boolean {
  return Math.abs(left.x - right.x) < 1e-6 && Math.abs(left.y - right.y) < 1e-6;
}

function appendPoints(target: Point[], source: readonly Point[]): Point[] {
  if (source.length === 0) {
    return target;
  }

  if (target.length === 0) {
    target.push(...source);
    return target;
  }

  if (almostEqualPoint(target.at(-1)!, source[0]!)) {
    target.push(...source.slice(1));
    return target;
  }

  target.push(...source);
  return target;
}

function reversePoints(points: readonly Point[]): Point[] {
  return [...points].reverse();
}

function traceFrom(
  startStrand: number,
  startPort: 0 | 1,
  instances: readonly StrandInstance[],
  visited: boolean[]
): Point[] {
  const path: Point[] = [];
  let currentStrand = startStrand;
  let entryPort = startPort;

  while (!visited[currentStrand]) {
    visited[currentStrand] = true;
    const instance = instances[currentStrand]!;
    let points = instance.points;
    let exitPort: 0 | 1 = 1;

    if (entryPort === 1) {
      points = reversePoints(points);
      exitPort = 0;
    }

    appendPoints(path, points);

    const next = instance.neighbors[exitPort];
    if (!next.valid || visited[next.strand]) {
      break;
    }

    currentStrand = next.strand;
    entryPort = next.port;
  }

  return path;
}

function tracePaths(instances: readonly StrandInstance[]): Polyline[] {
  const visited = Array.from({ length: instances.length }, () => false);
  const result: Polyline[] = [];

  for (let index = 0; index < instances.length; index += 1) {
    if (visited[index]) {
      continue;
    }

    const instance = instances[index]!;
    if (!instance.neighbors[0].valid || !instance.neighbors[1].valid) {
      const startPort: 0 | 1 =
        instance.neighbors[0].valid && !instance.neighbors[1].valid ? 1 : 0;
      result.push({ points: traceFrom(index, startPort, instances, visited) });
    }
  }

  for (let index = 0; index < instances.length; index += 1) {
    if (visited[index]) {
      continue;
    }

    result.push({ points: traceFrom(index, 0, instances, visited) });
  }

  return result.sort((left, right) => right.points.length - left.points.length);
}

function normalizeResolvedRotations(grid: TileGrid, rotations: readonly number[]): number[] {
  if (rotations.length !== grid.tiles.length) {
    throw new Error(`need ${grid.tiles.length} rotations, got ${rotations.length}`);
  }

  return rotations.map((rotation, index) => normalizeTileRotation(grid.tiles[index]!, rotation));
}

export function generateTilepaths(
  bounds: Bounds,
  grid: TileGrid,
  options: TilepathOptions = {}
): TilepathResult {
  const normalized = normalizeOptions(options);
  const { cellSize, origin } = fitGrid(bounds, grid, normalized);
  const shapes = precomputeShapes(normalized, cellSize);
  const explicitRotations =
    normalized.rotations.length > 0
      ? normalizeResolvedRotations(grid, normalized.rotations)
      : null;
  const solved = explicitRotations
    ? {
        rotations: explicitRotations,
        ...scoreLayout(grid, normalized.lanes, explicitRotations, shapes),
      }
    : solveRotations(grid, normalized, shapes);
  const instances = buildInstances(grid, normalized, cellSize, origin, solved.rotations, shapes);

  return {
    rows: grid.rows,
    cols: grid.cols,
    rotations: solved.rotations,
    paths: tracePaths(instances),
    componentSizes: solved.componentSizes,
    score: solved.score,
    cellSize,
    origin,
  };
}

export function tileCellOrigin(result: Pick<TilepathResult, "origin" | "cellSize" | "rows" | "cols">, row: number, col: number): Point {
  return {
    x: result.origin.x + col * result.cellSize,
    y: result.origin.y + (result.rows - 1 - row) * result.cellSize,
  };
}

export function debugTileGrid(grid: TileGrid, result: Pick<TilepathResult, "origin" | "cellSize" | "rows" | "cols" | "rotations">): readonly Polyline[] {
  const paths: Polyline[] = [];
  const x0 = result.origin.x;
  const y0 = result.origin.y;
  const x1 = result.origin.x + result.cols * result.cellSize;
  const y1 = result.origin.y + result.rows * result.cellSize;

  for (let col = 0; col <= result.cols; col += 1) {
    const x = result.origin.x + col * result.cellSize;
    paths.push({
      points: [
        { x, y: y0 },
        { x, y: y1 },
      ],
    });
  }

  for (let row = 0; row <= result.rows; row += 1) {
    const y = result.origin.y + row * result.cellSize;
    paths.push({
      points: [
        { x: x0, y },
        { x: x1, y },
      ],
    });
  }

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const index = tileIndex(grid, row, col);
      const origin = tileCellOrigin(result, row, col);
      const rotation = result.rotations[index] ?? 0;

      if (grid.tiles[index] === "line") {
        const margin = Math.max(2, result.cellSize * 0.25);
        const local = rotatePoints(
          [
            { x: margin, y: result.cellSize * 0.5 },
            { x: result.cellSize - margin, y: result.cellSize * 0.5 },
          ],
          result.cellSize,
          rotation
        );
        paths.push({
          points: translatePoints(local, origin),
        });
      } else {
        const radius = Math.min(result.cellSize * 0.28, result.cellSize - Math.max(2, result.cellSize * 0.2));
        const local = rotatePoints(
          quarterArc({ x: 0, y: 0 }, radius, 0, Math.PI / 2, 8),
          result.cellSize,
          rotation
        );
        paths.push({
          points: translatePoints(local, origin),
        });
      }
    }
  }

  return paths;
}

export function chooseTileGrid(size: Readonly<{ width: number; height: number }>, targetTile: number): Readonly<{
  rows: number;
  cols: number;
  tileSize: number;
}> {
  const safeTarget = Math.max(20, Math.min(targetTile, Math.min(size.width, size.height)));
  const targetMin = Math.max(20, Math.round(safeTarget * 0.9));
  const targetMax = Math.max(targetMin, Math.round(safeTarget * 1.1));
  const maxCols = Math.max(1, Math.floor(size.width / 20));
  const maxRows = Math.max(1, Math.floor(size.height / 20));

  let bestBand = -1;
  let bestCoverage = -1;
  let bestDiff = Number.POSITIVE_INFINITY;
  let bestRows = 1;
  let bestCols = 1;
  let bestSize = Math.floor(Math.min(size.width, size.height));

  for (let cols = 1; cols <= maxCols; cols += 1) {
    for (let rows = 1; rows <= maxRows; rows += 1) {
      const tileSize = Math.floor(Math.min(size.width / cols, size.height / rows));
      if (tileSize < 20) {
        continue;
      }

      const band = tileSize >= targetMin && tileSize <= targetMax ? 1 : 0;
      const coverage = rows * cols * tileSize * tileSize;
      const diff = Math.abs(tileSize - safeTarget);

      if (
        band > bestBand ||
        (band === bestBand && coverage > bestCoverage) ||
        (band === bestBand && coverage === bestCoverage && diff < bestDiff)
      ) {
        bestBand = band;
        bestCoverage = coverage;
        bestDiff = diff;
        bestRows = rows;
        bestCols = cols;
        bestSize = tileSize;
      }
    }
  }

  return {
    rows: bestRows,
    cols: bestCols,
    tileSize: bestSize,
  };
}

function normalizedAxis(index: number, count: number): number {
  return count <= 1 ? 0.5 : index / (count - 1);
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function distanceFromCenter(x: number, y: number): number {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return clamp01(distance / Math.sqrt(0.5));
}

function noise01(seed: number, row: number, col: number, salt: number): number {
  let value = BigInt.asUintN(64, BigInt(seed >>> 0));
  value = BigInt.asUintN(64, value + BigInt(salt >>> 0) + 0x9e3779b97f4a7c15n);
  value = BigInt.asUintN(64, value + BigInt(row) * 0xbf58476d1ce4e5b9n);
  value = BigInt.asUintN(64, value + BigInt(col) * 0x94d049bb133111ebn);
  value = BigInt.asUintN(64, value ^ (value >> 30n));
  value = BigInt.asUintN(64, value * 0xbf58476d1ce4e5b9n);
  value = BigInt.asUintN(64, value ^ (value >> 27n));
  value = BigInt.asUintN(64, value * 0x94d049bb133111ebn);
  value = BigInt.asUintN(64, value ^ (value >> 31n));
  return Number(value >> 11n) / Number(1n << 53n);
}

export function generateTileKinds(
  rows: number,
  cols: number,
  seed: number,
  arcPreference: number
): readonly TileKind[] {
  const result: TileKind[] = [];
  const arcThreshold = clamp01(arcPreference / 100);
  const frequencyX = 1 + Math.floor(noise01(seed, 0, 0, 0x1234) * 3);
  const frequencyY = 1 + Math.floor(noise01(seed, 0, 0, 0x5678) * 3);
  const phaseX = noise01(seed, 0, 0, 0x9abc) * Math.PI * 2;
  const phaseY = noise01(seed, 0, 0, 0xdef0) * Math.PI * 2;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = normalizedAxis(col, cols);
      const y = normalizedAxis(row, rows);
      const coarse = noise01(seed, Math.floor(row / 2), Math.floor(col / 2), 0xa5a5);
      const medium = noise01(seed, Math.floor(row / 3), Math.floor(col / 3), 0x5a5a);
      const fine = noise01(seed, row, col, 0x3141);
      const wave =
        0.5 +
        0.5 *
          Math.sin(frequencyX * 2 * Math.PI * x + phaseX) *
          Math.cos(frequencyY * 2 * Math.PI * y + phaseY);
      const ring = 1 - distanceFromCenter(x, y);
      const field = 0.35 * coarse + 0.25 * medium + 0.15 * fine + 0.15 * wave + 0.1 * ring;
      result.push(field < arcThreshold ? "arc" : "line");
    }
  }

  return result;
}
