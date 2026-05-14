export type PageSize = Readonly<{
  widthMm: number;
  heightMm: number;
}>;

export type HeightMeshBounds = Readonly<{
  originXMm: number;
  originYMm: number;
  widthMm: number;
  heightMm: number;
}>;

export type HeightMeshSamplePoint = Readonly<{
  xMm: number;
  yMm: number;
  row: number;
  column: number;
}>;

export type HeightMeshProbeReading = Readonly<{
  xMm: number;
  yMm: number;
  zMm: number;
  probeTriggered: boolean;
  rawLine: string;
}>;

export type HeightMeshSamplerConfig = Readonly<{
  enabled?: boolean;
  columns: number;
  rows: number;
  originXMm?: number;
  originYMm?: number;
  widthMm?: number;
  heightMm?: number;
  travelCommand?: "G0" | "G1";
  moveFeedRateMmPerMin: number;
  probeFeedRateMmPerMin: number;
  releaseFeedRateMmPerMin: number;
  probeDepthMm: number;
  releaseDistanceMm: number;
  clearanceMm?: number;
  serpentine?: boolean;
}>;

export type HeightMeshGrid = Readonly<{
  columns: number;
  rows: number;
  spacingXMm: number;
  spacingYMm: number;
  serpentine: boolean;
}>;

export type HeightMeshFileSample = HeightMeshSamplePoint &
  Readonly<{
    zMm: number;
    probeTriggered: boolean;
    rawLine?: string;
  }>;

export type HeightMeshFile = Readonly<{
  kind: "ligneclaire-height-mesh";
  version: 1;
  createdAt: string;
  unit: "mm";
  plotter: Readonly<{
    id: string;
    label?: string;
  }>;
  page: PageSize;
  bounds: HeightMeshBounds;
  grid: HeightMeshGrid;
  samples: readonly HeightMeshFileSample[];
  stats: Readonly<{
    minZMm: number;
    maxZMm: number;
    averageZMm: number;
  }>;
}>;

export type HeightMeshCompensationConfig = Readonly<{
  enabled?: boolean;
  interpolation?: "bilinear" | "nearest";
  referenceMode?: "max" | "min" | "mean";
}>;

type NormalizedHeightMeshSamplerConfig = Readonly<{
  enabled: boolean;
  columns: number;
  rows: number;
  originXMm: number;
  originYMm: number;
  widthMm: number;
  heightMm: number;
  travelCommand: "G0" | "G1";
  moveFeedRateMmPerMin: number;
  probeFeedRateMmPerMin: number;
  releaseFeedRateMmPerMin: number;
  probeDepthMm: number;
  releaseDistanceMm: number;
  clearanceMm: number;
  serpentine: boolean;
}>;

export type HeightMeshSamplerGcodeOptions = Readonly<{
  includeUnitCommand?: boolean;
  includeAbsoluteModeCommand?: boolean;
}>;

export type HeightMeshFileMetadata = Readonly<{
  createdAt?: string;
  plotterId: string;
  plotterLabel?: string;
}>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString();
}

function convertLengthMm(valueMm: number, unit: "mm" | "in"): number {
  return unit === "mm" ? valueMm : valueMm / 25.4;
}

function formatLength(valueMm: number, unit: "mm" | "in"): string {
  return formatNumber(convertLengthMm(valueMm, unit));
}

function formatFeedRate(valueMmPerMin: number, unit: "mm" | "in"): string {
  return formatNumber(convertLengthMm(valueMmPerMin, unit));
}

function axisSampleCount(spanMm: number, sampleDistanceMm: number): number {
  if (spanMm <= 0) {
    return 1;
  }

  return Math.max(2, Math.ceil(spanMm / sampleDistanceMm) + 1);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readOptionalString(
  value: unknown
): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readOptionalObject(
  value: unknown
): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function resolveHeightMeshGrid(
  widthMm: number,
  heightMm: number,
  sampleDistanceMm: number
): HeightMeshGrid {
  const safeWidthMm = Math.max(0, widthMm);
  const safeHeightMm = Math.max(0, heightMm);
  const safeSampleDistanceMm = Math.max(0.1, Math.abs(sampleDistanceMm));
  const columns = axisSampleCount(safeWidthMm, safeSampleDistanceMm);
  const rows = axisSampleCount(safeHeightMm, safeSampleDistanceMm);

  return {
    columns,
    rows,
    spacingXMm: columns > 1 ? safeWidthMm / (columns - 1) : 0,
    spacingYMm: rows > 1 ? safeHeightMm / (rows - 1) : 0,
    serpentine: true,
  };
}

export function normalizeHeightMeshSamplerConfig(
  page: PageSize,
  config: HeightMeshSamplerConfig
): NormalizedHeightMeshSamplerConfig {
  const originXMm = clamp(config.originXMm ?? 0, 0, page.widthMm);
  const originYMm = clamp(config.originYMm ?? 0, 0, page.heightMm);
  const widthMm = clamp(
    config.widthMm ?? page.widthMm - originXMm,
    0,
    page.widthMm - originXMm
  );
  const heightMm = clamp(
    config.heightMm ?? page.heightMm - originYMm,
    0,
    page.heightMm - originYMm
  );

  return {
    enabled: config.enabled ?? true,
    columns: Math.max(1, Math.floor(config.columns)),
    rows: Math.max(1, Math.floor(config.rows)),
    originXMm,
    originYMm,
    widthMm,
    heightMm,
    travelCommand: config.travelCommand ?? "G1",
    moveFeedRateMmPerMin: Math.max(1, config.moveFeedRateMmPerMin),
    probeFeedRateMmPerMin: Math.max(1, config.probeFeedRateMmPerMin),
    releaseFeedRateMmPerMin: Math.max(1, config.releaseFeedRateMmPerMin),
    probeDepthMm: -Math.max(0.1, Math.abs(config.probeDepthMm)),
    releaseDistanceMm: Math.max(0.1, Math.abs(config.releaseDistanceMm)),
    clearanceMm: Math.max(0, Math.abs(config.clearanceMm ?? 0)),
    serpentine: config.serpentine ?? true,
  };
}

export function buildHeightMeshGrid(
  page: PageSize,
  config: HeightMeshSamplerConfig
): HeightMeshGrid {
  const normalized = normalizeHeightMeshSamplerConfig(page, config);

  return {
    columns: normalized.columns,
    rows: normalized.rows,
    spacingXMm:
      normalized.columns > 1 ? normalized.widthMm / (normalized.columns - 1) : 0,
    spacingYMm:
      normalized.rows > 1 ? normalized.heightMm / (normalized.rows - 1) : 0,
    serpentine: normalized.serpentine,
  };
}

function axisSteps(originMm: number, spanMm: number, count: number): readonly number[] {
  if (count <= 1) {
    return [originMm + spanMm * 0.5];
  }

  return Array.from({ length: count }, (_, index) => originMm + (spanMm * index) / (count - 1));
}

export function buildHeightMeshSamplePoints(
  page: PageSize,
  config: HeightMeshSamplerConfig
): readonly HeightMeshSamplePoint[] {
  const normalized = normalizeHeightMeshSamplerConfig(page, config);
  if (!normalized.enabled) {
    return [];
  }

  const xSteps = axisSteps(normalized.originXMm, normalized.widthMm, normalized.columns);
  const ySteps = axisSteps(normalized.originYMm, normalized.heightMm, normalized.rows);
  const points: HeightMeshSamplePoint[] = [];

  for (let row = 0; row < ySteps.length; row += 1) {
    const yMm = ySteps[row]!;
    const columns = normalized.serpentine && row % 2 === 1
      ? xSteps
          .map((xMm, index) => ({
            xMm,
            column: index,
          }))
          .reverse()
      : xSteps.map((xMm, index) => ({
          xMm,
          column: index,
        }));

    for (const column of columns) {
      points.push({
        xMm: column.xMm,
        yMm,
        row,
        column: column.column,
      });
    }
  }

  return points;
}

export function createHeightMeshSamplerGcode(
  page: PageSize,
  unit: "mm" | "in",
  config: HeightMeshSamplerConfig,
  options: HeightMeshSamplerGcodeOptions = {}
): string {
  const normalized = normalizeHeightMeshSamplerConfig(page, config);
  if (!normalized.enabled) {
    return "";
  }

  const points = buildHeightMeshSamplePoints(page, normalized);
  if (points.length === 0) {
    return "";
  }

  const lines: string[] = ["; Height mesh sampler"];

  if (options.includeUnitCommand ?? true) {
    lines.push(unit === "mm" ? "G21" : "G20");
  }

  if (options.includeAbsoluteModeCommand ?? true) {
    lines.push("G90");
  }

  for (const point of points) {
    lines.push(
      `; Probe row ${point.row + 1}, column ${point.column + 1}`,
      `${normalized.travelCommand} X${formatLength(point.xMm, unit)} Y${formatLength(point.yMm, unit)} F${formatFeedRate(normalized.moveFeedRateMmPerMin, unit)}`,
      `G1 F${formatFeedRate(normalized.probeFeedRateMmPerMin, unit)}`,
      `G38.2 Z${formatLength(normalized.probeDepthMm, unit)}`,
      "G91",
      `G1 F${formatFeedRate(normalized.releaseFeedRateMmPerMin, unit)}`,
      `G38.4 Z${formatLength(normalized.releaseDistanceMm, unit)}`
    );

    if (normalized.clearanceMm > 0) {
      lines.push(`G0 Z${formatLength(normalized.clearanceMm, unit)}`);
    }

    lines.push("G90");
  }

  return `${lines.join("\n")}\n`;
}

export function parseHeightMeshProbeLine(
  line: string
): HeightMeshProbeReading | null {
  const match =
    /^\[?PRB:\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*:\s*([01])\s*\]?$/i.exec(
      line.trim()
    );

  if (!match) {
    return null;
  }

  const xMm = Number(match[1]);
  const yMm = Number(match[2]);
  const zMm = Number(match[3]);
  const probeTriggered = match[4] === "1";

  if (![xMm, yMm, zMm].every(Number.isFinite)) {
    return null;
  }

  return {
    xMm,
    yMm,
    zMm,
    probeTriggered,
    rawLine: line.trim(),
  };
}

export function createHeightMeshFile(
  page: PageSize,
  config: HeightMeshSamplerConfig,
  readings: readonly HeightMeshProbeReading[],
  metadata: HeightMeshFileMetadata
): HeightMeshFile {
  const normalized = normalizeHeightMeshSamplerConfig(page, config);
  const points = buildHeightMeshSamplePoints(page, normalized);
  if (points.length !== readings.length) {
    throw new Error(
      `Height mesh expected ${points.length} probe readings but received ${readings.length}.`
    );
  }

  const samples = points.map((point, index) => {
    const reading = readings[index]!;
    return {
      ...point,
      zMm: reading.zMm,
      probeTriggered: reading.probeTriggered,
      rawLine: reading.rawLine,
    } satisfies HeightMeshFileSample;
  });

  const zValues = samples.map((sample) => sample.zMm);
  const minZMm = Math.min(...zValues);
  const maxZMm = Math.max(...zValues);
  const averageZMm = zValues.reduce((sum, value) => sum + value, 0) / zValues.length;

  return {
    kind: "ligneclaire-height-mesh",
    version: 1,
    createdAt: metadata.createdAt ?? new Date().toISOString(),
    unit: "mm",
    plotter: {
      id: metadata.plotterId,
      label: metadata.plotterLabel,
    },
    page,
    bounds: {
      originXMm: normalized.originXMm,
      originYMm: normalized.originYMm,
      widthMm: normalized.widthMm,
      heightMm: normalized.heightMm,
    },
    grid: buildHeightMeshGrid(page, normalized),
    samples,
    stats: {
      minZMm,
      maxZMm,
      averageZMm,
    },
  };
}

export function resolveHeightMeshReferenceZ(
  mesh: HeightMeshFile,
  referenceMode: HeightMeshCompensationConfig["referenceMode"] = "max"
): number {
  switch (referenceMode ?? "max") {
    case "min":
      return mesh.stats.minZMm;
    case "mean":
      return mesh.stats.averageZMm;
    case "max":
    default:
      return mesh.stats.maxZMm;
  }
}

function meshSamplesByRow(mesh: HeightMeshFile): HeightMeshFileSample[][] {
  return Array.from({ length: mesh.grid.rows }, (_, row) =>
    Array.from({ length: mesh.grid.columns }, (_, column) => {
      const sample = mesh.samples.find(
        (candidate) => candidate.row === row && candidate.column === column
      );
      if (!sample) {
        throw new Error(
          `Height mesh is missing sample at row ${row + 1}, column ${column + 1}.`
        );
      }
      return sample;
    })
  );
}

function interpolateLinear(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

export function sampleHeightMeshZ(
  mesh: HeightMeshFile,
  xMm: number,
  yMm: number,
  interpolation: HeightMeshCompensationConfig["interpolation"] = "bilinear"
): number {
  const samples = meshSamplesByRow(mesh);
  const widthMm = Math.max(mesh.bounds.widthMm, 0);
  const heightMm = Math.max(mesh.bounds.heightMm, 0);
  const clampedXMm = clamp(
    xMm,
    mesh.bounds.originXMm,
    mesh.bounds.originXMm + widthMm
  );
  const clampedYMm = clamp(
    yMm,
    mesh.bounds.originYMm,
    mesh.bounds.originYMm + heightMm
  );
  const relativeX = clampedXMm - mesh.bounds.originXMm;
  const relativeY = clampedYMm - mesh.bounds.originYMm;
  const stepX = mesh.grid.spacingXMm;
  const stepY = mesh.grid.spacingYMm;

  const leftColumn =
    mesh.grid.columns <= 1 || stepX <= 0
      ? 0
      : Math.min(mesh.grid.columns - 2, Math.max(0, Math.floor(relativeX / stepX)));
  const topRow =
    mesh.grid.rows <= 1 || stepY <= 0
      ? 0
      : Math.min(mesh.grid.rows - 2, Math.max(0, Math.floor(relativeY / stepY)));
  const rightColumn = Math.min(mesh.grid.columns - 1, leftColumn + 1);
  const bottomRow = Math.min(mesh.grid.rows - 1, topRow + 1);
  const xFraction =
    rightColumn === leftColumn || stepX <= 0
      ? 0
      : (relativeX - leftColumn * stepX) / stepX;
  const yFraction =
    bottomRow === topRow || stepY <= 0
      ? 0
      : (relativeY - topRow * stepY) / stepY;
  const topLeft = samples[topRow]![leftColumn]!;
  const topRight = samples[topRow]![rightColumn]!;
  const bottomLeft = samples[bottomRow]![leftColumn]!;
  const bottomRight = samples[bottomRow]![rightColumn]!;

  if (interpolation === "nearest") {
    const nearestColumn = xFraction <= 0.5 ? leftColumn : rightColumn;
    const nearestRow = yFraction <= 0.5 ? topRow : bottomRow;
    return samples[nearestRow]![nearestColumn]!.zMm;
  }

  if (leftColumn === rightColumn && topRow === bottomRow) {
    return topLeft.zMm;
  }

  if (leftColumn === rightColumn) {
    return interpolateLinear(topLeft.zMm, bottomLeft.zMm, yFraction);
  }

  if (topRow === bottomRow) {
    return interpolateLinear(topLeft.zMm, topRight.zMm, xFraction);
  }

  const top = interpolateLinear(topLeft.zMm, topRight.zMm, xFraction);
  const bottom = interpolateLinear(bottomLeft.zMm, bottomRight.zMm, xFraction);
  return interpolateLinear(top, bottom, yFraction);
}

export function parseHeightMeshFile(value: unknown): HeightMeshFile | null {
  const candidate = readOptionalObject(value);
  if (!candidate) {
    return null;
  }

  if (candidate.kind !== "ligneclaire-height-mesh" || candidate.version !== 1 || candidate.unit !== "mm") {
    return null;
  }

  const plotter = readOptionalObject(candidate.plotter);
  const page = readOptionalObject(candidate.page);
  const bounds = readOptionalObject(candidate.bounds);
  const grid = readOptionalObject(candidate.grid);
  if (!plotter || !page || !bounds || !grid || !Array.isArray(candidate.samples)) {
    return null;
  }

  const parsedSamples = candidate.samples.flatMap((entry) => {
    const sample = readOptionalObject(entry);
    if (!sample) {
      return [];
    }

    if (
      !isFiniteNumber(sample.xMm) ||
      !isFiniteNumber(sample.yMm) ||
      !isFiniteNumber(sample.zMm) ||
      !isFiniteNumber(sample.row) ||
      !isFiniteNumber(sample.column) ||
      typeof sample.probeTriggered !== "boolean"
    ) {
      return [];
    }

    return [
      {
        xMm: sample.xMm,
        yMm: sample.yMm,
        zMm: sample.zMm,
        row: sample.row,
        column: sample.column,
        probeTriggered: sample.probeTriggered,
        rawLine: readOptionalString(sample.rawLine),
      } satisfies HeightMeshFileSample,
    ];
  });

  if (parsedSamples.length !== candidate.samples.length) {
    return null;
  }

  if (parsedSamples.length === 0) {
    return null;
  }

  const minZMm = Math.min(...parsedSamples.map((sample) => sample.zMm));
  const maxZMm = Math.max(...parsedSamples.map((sample) => sample.zMm));
  const averageZMm =
    parsedSamples.reduce((sum, sample) => sum + sample.zMm, 0) / parsedSamples.length;

  if (
    typeof plotter.id !== "string" ||
    !isFiniteNumber(page.widthMm) ||
    !isFiniteNumber(page.heightMm) ||
    !isFiniteNumber(bounds.originXMm) ||
    !isFiniteNumber(bounds.originYMm) ||
    !isFiniteNumber(bounds.widthMm) ||
    !isFiniteNumber(bounds.heightMm) ||
    !isFiniteNumber(grid.columns) ||
    !isFiniteNumber(grid.rows) ||
    !isFiniteNumber(grid.spacingXMm) ||
    !isFiniteNumber(grid.spacingYMm) ||
    typeof grid.serpentine !== "boolean" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  return {
    kind: "ligneclaire-height-mesh",
    version: 1,
    createdAt: candidate.createdAt,
    unit: "mm",
    plotter: {
      id: plotter.id,
      label: readOptionalString(plotter.label),
    },
    page: {
      widthMm: page.widthMm,
      heightMm: page.heightMm,
    },
    bounds: {
      originXMm: bounds.originXMm,
      originYMm: bounds.originYMm,
      widthMm: bounds.widthMm,
      heightMm: bounds.heightMm,
    },
    grid: {
      columns: grid.columns,
      rows: grid.rows,
      spacingXMm: grid.spacingXMm,
      spacingYMm: grid.spacingYMm,
      serpentine: grid.serpentine,
    },
    samples: parsedSamples,
    stats: {
      minZMm,
      maxZMm,
      averageZMm,
    },
  };
}
