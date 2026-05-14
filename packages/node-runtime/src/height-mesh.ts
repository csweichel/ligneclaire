import {
  resolveHeightMeshReferenceZ,
  sampleHeightMeshZ,
  type HeightMeshFile,
} from "@ligneclaire/engine";
import type { PlotterConfig } from "./plotters";

export {
  buildHeightMeshGrid,
  buildHeightMeshSamplePoints,
  createHeightMeshFile,
  createHeightMeshSamplerGcode,
  normalizeHeightMeshSamplerConfig,
  parseHeightMeshFile,
  parseHeightMeshProbeLine,
  resolveHeightMeshGrid,
  resolveHeightMeshReferenceZ,
  sampleHeightMeshZ,
  type HeightMeshBounds,
  type HeightMeshCompensationConfig,
  type HeightMeshFile,
  type HeightMeshFileMetadata,
  type HeightMeshFileSample,
  type HeightMeshGrid,
  type HeightMeshProbeReading,
  type HeightMeshSamplePoint,
  type HeightMeshSamplerConfig,
  type HeightMeshSamplerGcodeOptions,
  type PageSize,
} from "@ligneclaire/engine";

type MotionState = Readonly<{
  x: number;
  y: number;
  z: number;
  absolute: boolean;
  unitScale: number;
}>;

function splitLines(content: string): readonly string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, " ").toUpperCase();
}

function formatNumber(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString();
}

function commandBlockLines(command: string): readonly string[] {
  return splitLines(command);
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
    if (normalizeLine(lines[startIndex + index]!) !== normalizeLine(block[index]!)) {
      return false;
    }
  }

  return true;
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

function nextMotionState(state: MotionState, rawLine: string): MotionState {
  const line = normalizeLine(rawLine);
  if (line.length === 0 || line.startsWith(";")) {
    return state;
  }

  let nextState = state;
  if (/\bG20\b/.test(line)) {
    nextState = { ...nextState, unitScale: 25.4 };
  }
  if (/\bG21\b/.test(line)) {
    nextState = { ...nextState, unitScale: 1 };
  }
  if (/\bG90\b/.test(line)) {
    nextState = { ...nextState, absolute: true };
  }
  if (/\bG91\b/.test(line)) {
    nextState = { ...nextState, absolute: false };
  }

  if (!/\bG0\b|\bG00\b|\bG1\b|\bG01\b/.test(line)) {
    return nextState;
  }

  const nextX = nextAxisValue(
    nextState.x,
    readAxisWord(line, "X"),
    nextState.absolute,
    nextState.unitScale
  );
  const nextY = nextAxisValue(
    nextState.y,
    readAxisWord(line, "Y"),
    nextState.absolute,
    nextState.unitScale
  );
  const nextZ = nextAxisValue(
    nextState.z,
    readAxisWord(line, "Z"),
    nextState.absolute,
    nextState.unitScale
  );

  return {
    ...nextState,
    x: nextX,
    y: nextY,
    z: nextZ,
  };
}

function hasMotionXY(line: string): boolean {
  const normalized = normalizeLine(line);
  return /\bG0\b|\bG00\b|\bG1\b|\bG01\b/.test(normalized) &&
    (/\bX[-+]?\d/.test(normalized) || /\bY[-+]?\d/.test(normalized));
}

function hasAxisWord(line: string, axis: "X" | "Y" | "Z"): boolean {
  return new RegExp(`\\b${axis}[-+]?\\d`, "i").test(normalizeLine(line));
}

function withAbsoluteZ(line: string, zMm: number): string {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  if (hasAxisWord(trimmed, "Z")) {
    return trimmed.replace(/\bZ[-+]?\d*\.?\d+/i, `Z${formatNumber(zMm)}`);
  }

  return `${trimmed} Z${formatNumber(zMm)}`;
}

function createAbsoluteZMove(zMm: number, feedRateMmPerMin: number): string {
  return `G1 Z${formatNumber(zMm)} F${formatNumber(feedRateMmPerMin)}`;
}

export function applyHeightMeshCompensation(
  gcode: string,
  mesh: HeightMeshFile,
  plotter: PlotterConfig
): string {
  const compensation = plotter.gcode.heightMeshCompensation;
  if (!compensation || compensation.enabled === false) {
    return gcode;
  }

  const activeCompensation = compensation;
  const penDownBlock = commandBlockLines(plotter.gcode.penDownCommand);
  const penUpBlock = commandBlockLines(plotter.gcode.penUpCommand);
  const referenceZMm = resolveHeightMeshReferenceZ(mesh, activeCompensation.referenceMode);
  const lines = splitLines(gcode);
  const output: string[] = [
    `; Height mesh compensation ${mesh.plotter.id} reference ${formatNumber(referenceZMm)}mm`,
  ];
  let state: MotionState = {
    x: 0,
    y: 0,
    z: 0,
    absolute: true,
    unitScale: 1,
  };
  let penDown = false;
  let drawBaseZMm = 0;
  let currentOffsetZMm = 0;

  function meshOffsetAt(xMm: number, yMm: number): number {
    return (
      sampleHeightMeshZ(mesh, xMm, yMm, activeCompensation.interpolation) - referenceZMm
    );
  }

  for (let index = 0; index < lines.length; ) {
    if (blockMatches(lines, index, penDownBlock)) {
      for (const line of penDownBlock) {
        output.push(line);
        state = nextMotionState(state, line);
      }

      penDown = true;
      drawBaseZMm = state.z;
      const nextOffsetZMm = meshOffsetAt(state.x, state.y);
      if (Math.abs(nextOffsetZMm) > 0.0001) {
        output.push(
          createAbsoluteZMove(drawBaseZMm + nextOffsetZMm, plotter.gcode.feedRateMmPerMin)
        );
        state = {
          ...state,
          z: drawBaseZMm + nextOffsetZMm,
          absolute: true,
        };
      }
      currentOffsetZMm = nextOffsetZMm;
      index += penDownBlock.length;
      continue;
    }

    if (blockMatches(lines, index, penUpBlock)) {
      if (penDown && Math.abs(currentOffsetZMm) > 0.0001) {
        output.push(createAbsoluteZMove(drawBaseZMm, plotter.gcode.feedRateMmPerMin));
        state = {
          ...state,
          z: drawBaseZMm,
          absolute: true,
        };
      }

      for (const line of penUpBlock) {
        output.push(line);
        state = nextMotionState(state, line);
      }

      penDown = false;
      currentOffsetZMm = 0;
      index += penUpBlock.length;
      continue;
    }

    const line = lines[index]!;
    let nextLine = line;
    if (penDown && hasMotionXY(line)) {
      const lineState = nextMotionState(state, line);
      const nextOffsetZMm = meshOffsetAt(lineState.x, lineState.y);
      nextLine = withAbsoluteZ(line, drawBaseZMm + nextOffsetZMm);
      currentOffsetZMm = nextOffsetZMm;
      output.push(nextLine);
      state = nextMotionState(state, nextLine);
      index += 1;
      continue;
    }

    output.push(nextLine);
    state = nextMotionState(state, nextLine);
    index += 1;
  }

  return `${output.join("\n")}\n`;
}
