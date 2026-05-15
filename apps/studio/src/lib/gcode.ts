export type GcodeMotionSegment = Readonly<{
  lineNumber: number;
  from: Readonly<{
    x: number;
    y: number;
  }>;
  to: Readonly<{
    x: number;
    y: number;
  }>;
  drawing: boolean;
}>;

export type GcodePreviewDocument = Readonly<{
  lineCount: number;
  bounds: Readonly<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }> | null;
  segments: readonly GcodeMotionSegment[];
  drawingSegments: number;
  travelSegments: number;
}>;

export type ParseGcodePreviewOptions = Readonly<{
  penUpCommand?: string;
  penDownCommand?: string;
}>;

const commentPattern = /\([^)]*\)/g;

type ParserState = Readonly<{
  x: number;
  y: number;
  z: number;
  absolute: boolean;
  unitScale: number;
  drawing: boolean;
}>;

function stripComments(line: string): string {
  const withoutSemicolon = line.split(";")[0] ?? line;
  return withoutSemicolon.replace(commentPattern, "").trim();
}

function normalizeLine(line: string): string {
  return stripComments(line).replace(/\s+/g, " ").trim().toUpperCase();
}

function readAxisWord(line: string, axis: "X" | "Y" | "Z"): number | null {
  const match = new RegExp(`${axis}([-+]?\\d*\\.?\\d+)`, "i").exec(line);
  if (!match?.[1]) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function nextAxisValue(
  current: number,
  candidate: number | null,
  absolute: boolean,
  unitScale: number
): number {
  if (candidate === null) {
    return current;
  }

  const scaled = candidate * unitScale;
  return absolute ? scaled : current + scaled;
}

export function splitGcodeLines(content: string): readonly string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function commandBlockLines(command: string | undefined): readonly string[] {
  if (!command) {
    return [];
  }

  return splitGcodeLines(command)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
}

function blockMatches(
  lines: readonly string[],
  startIndex: number,
  block: readonly string[]
): boolean {
  if (block.length === 0 || startIndex + block.length > lines.length) {
    return false;
  }

  for (let index = 0; index < block.length; index += 1) {
    if (normalizeLine(lines[startIndex + index]!) !== block[index]) {
      return false;
    }
  }

  return true;
}

function nextParserState(state: ParserState, rawLine: string): ParserState {
  const upperLine = normalizeLine(rawLine);
  if (upperLine.length === 0) {
    return state;
  }

  let nextState = state;
  if (/\bG20\b/.test(upperLine)) {
    nextState = { ...nextState, unitScale: 25.4 };
  }
  if (/\bG21\b/.test(upperLine)) {
    nextState = { ...nextState, unitScale: 1 };
  }
  if (/\bG90\b/.test(upperLine)) {
    nextState = { ...nextState, absolute: true };
  }
  if (/\bG91\b/.test(upperLine)) {
    nextState = { ...nextState, absolute: false };
  }

  if (!/\bG0\b|\bG00\b|\bG1\b|\bG01\b/.test(upperLine)) {
    return nextState;
  }

  return {
    ...nextState,
    x: nextAxisValue(
      nextState.x,
      readAxisWord(upperLine, "X"),
      nextState.absolute,
      nextState.unitScale
    ),
    y: nextAxisValue(
      nextState.y,
      readAxisWord(upperLine, "Y"),
      nextState.absolute,
      nextState.unitScale
    ),
    z: nextAxisValue(
      nextState.z,
      readAxisWord(upperLine, "Z"),
      nextState.absolute,
      nextState.unitScale
    ),
  };
}

export function parseGcodePreview(
  content: string,
  options: ParseGcodePreviewOptions = {}
): GcodePreviewDocument {
  const lines = splitGcodeLines(content);
  const penDownBlock = commandBlockLines(options.penDownCommand);
  const penUpBlock = commandBlockLines(options.penUpCommand);
  let state: ParserState = {
    x: 0,
    y: 0,
    z: 0,
    absolute: true,
    unitScale: 1,
    drawing: false,
  };
  const segments: GcodeMotionSegment[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  function includePoint(x: number, y: number): void {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  for (let index = 0; index < lines.length; ) {
    if (blockMatches(lines, index, penDownBlock)) {
      let nextState = state;
      for (let blockIndex = 0; blockIndex < penDownBlock.length; blockIndex += 1) {
        nextState = nextParserState(nextState, lines[index + blockIndex]!);
      }
      state = {
        ...nextState,
        drawing: true,
      };
      index += penDownBlock.length;
      continue;
    }

    if (blockMatches(lines, index, penUpBlock)) {
      let nextState = state;
      for (let blockIndex = 0; blockIndex < penUpBlock.length; blockIndex += 1) {
        nextState = nextParserState(nextState, lines[index + blockIndex]!);
      }
      state = {
        ...nextState,
        drawing: false,
      };
      index += penUpBlock.length;
      continue;
    }

    const rawLine = lines[index]!;
    const line = stripComments(rawLine);
    if (line.length === 0) {
      index += 1;
      continue;
    }

    const upperLine = line.toUpperCase();
    if (/\bM3\b/.test(upperLine) || /\bM4\b/.test(upperLine)) {
      state = { ...state, drawing: true };
    }
    if (/\bM5\b/.test(upperLine)) {
      state = { ...state, drawing: false };
    }

    if (!/\bG0\b|\bG00\b|\bG1\b|\bG01\b/.test(upperLine)) {
      state = nextParserState(state, rawLine);
      index += 1;
      continue;
    }

    const xWord = readAxisWord(upperLine, "X");
    const yWord = readAxisWord(upperLine, "Y");
    const hasXYMotion = xWord !== null || yWord !== null;
    const zWord = readAxisWord(upperLine, "Z");
    const nextState = nextParserState(state, rawLine);
    const nextDrawing =
      /\bM3\b|\bM4\b/.test(upperLine)
        ? true
        : /\bM5\b/.test(upperLine)
          ? false
          : !hasXYMotion && zWord !== null
            ? nextState.z >= 0
            : state.drawing;

    if (nextState.x === state.x && nextState.y === state.y) {
      state = {
        ...nextState,
        drawing: nextDrawing,
      };
      index += 1;
      continue;
    }

    const segment: GcodeMotionSegment = {
      lineNumber: index + 1,
      from: {
        x: state.x,
        y: state.y,
      },
      to: {
        x: nextState.x,
        y: nextState.y,
      },
      drawing: nextDrawing,
    };
    segments.push(segment);
    includePoint(segment.from.x, segment.from.y);
    includePoint(segment.to.x, segment.to.y);

    state = {
      ...nextState,
      drawing: nextDrawing,
    };
    index += 1;
  }

  return {
    lineCount: lines.length,
    bounds:
      segments.length > 0
        ? {
            minX,
            minY,
            maxX,
            maxY,
          }
        : null,
    segments,
    drawingSegments: segments.filter((segment) => segment.drawing).length,
    travelSegments: segments.filter((segment) => !segment.drawing).length,
  };
}
