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

const commentPattern = /\([^)]*\)/g;

type ParserState = Readonly<{
  x: number;
  y: number;
  absolute: boolean;
  unitScale: number;
  drawing: boolean;
}>;

function stripComments(line: string): string {
  const withoutSemicolon = line.split(";")[0] ?? line;
  return withoutSemicolon.replace(commentPattern, "").trim();
}

function readAxisWord(line: string, axis: "X" | "Y"): number | null {
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

export function parseGcodePreview(content: string): GcodePreviewDocument {
  const lines = splitGcodeLines(content);
  let state: ParserState = {
    x: 0,
    y: 0,
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

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]!;
    const line = stripComments(rawLine);
    if (line.length === 0) {
      continue;
    }

    const upperLine = line.toUpperCase();
    if (/\bG20\b/.test(upperLine)) {
      state = { ...state, unitScale: 25.4 };
    }
    if (/\bG21\b/.test(upperLine)) {
      state = { ...state, unitScale: 1 };
    }
    if (/\bG90\b/.test(upperLine)) {
      state = { ...state, absolute: true };
    }
    if (/\bG91\b/.test(upperLine)) {
      state = { ...state, absolute: false };
    }
    if (/\bM3\b/.test(upperLine) || /\bM4\b/.test(upperLine)) {
      state = { ...state, drawing: true };
    }
    if (/\bM5\b/.test(upperLine)) {
      state = { ...state, drawing: false };
    }

    if (!/\bG0\b|\bG00\b|\bG1\b|\bG01\b/.test(upperLine)) {
      continue;
    }

    const nextX = nextAxisValue(
      state.x,
      readAxisWord(upperLine, "X"),
      state.absolute,
      state.unitScale
    );
    const nextY = nextAxisValue(
      state.y,
      readAxisWord(upperLine, "Y"),
      state.absolute,
      state.unitScale
    );

    if (nextX === state.x && nextY === state.y) {
      continue;
    }

    const segment: GcodeMotionSegment = {
      lineNumber: index + 1,
      from: {
        x: state.x,
        y: state.y,
      },
      to: {
        x: nextX,
        y: nextY,
      },
      drawing: state.drawing,
    };
    segments.push(segment);
    includePoint(segment.from.x, segment.from.y);
    includePoint(segment.to.x, segment.to.y);

    state = {
      ...state,
      x: nextX,
      y: nextY,
    };
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
