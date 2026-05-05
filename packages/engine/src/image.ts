import type { Bounds, Point, Polyline } from "./document";
import { clamp } from "./geometry";

export type GrayscaleImageGrid = Readonly<{
  columns: number;
  rows: number;
  values: readonly number[];
}>;

export type GrayscaleSample = Readonly<{
  luminosity: number;
}>;

function decodeBase64Bytes(encoded: string): number[] {
  const binary =
    typeof atob === "function" ? atob(encoded) : Buffer.from(encoded, "base64").toString("binary");
  return Array.from(binary, (char) => char.charCodeAt(0));
}

export function decodeGrayscaleImageGrid(
  columns: number,
  rows: number,
  encoded: string
): GrayscaleImageGrid {
  const values = decodeBase64Bytes(encoded);
  if (values.length !== columns * rows) {
    throw new Error(`Expected ${columns * rows} grayscale values, received ${values.length}.`);
  }

  return {
    columns,
    rows,
    values,
  };
}

function valueAt(grid: GrayscaleImageGrid, column: number, row: number): number {
  const clampedColumn = clamp(column, 0, grid.columns - 1);
  const clampedRow = clamp(row, 0, grid.rows - 1);
  return grid.values[clampedRow * grid.columns + clampedColumn] ?? 255;
}

export function sampleGrayscaleImageGrid(
  grid: GrayscaleImageGrid,
  point: Point,
  bounds: Bounds
): GrayscaleSample | null {
  if (
    point.x < bounds.minX ||
    point.x > bounds.maxX ||
    point.y < bounds.minY ||
    point.y > bounds.maxY
  ) {
    return null;
  }

  const width = Math.max(1e-6, bounds.maxX - bounds.minX);
  const height = Math.max(1e-6, bounds.maxY - bounds.minY);
  const normalizedX = (point.x - bounds.minX) / width;
  const normalizedY = (point.y - bounds.minY) / height;
  const column = Math.min(grid.columns - 1, Math.floor(normalizedX * grid.columns));
  const row = Math.min(grid.rows - 1, Math.floor((1 - normalizedY) * grid.rows));

  return {
    luminosity: valueAt(grid, column, row) / 255,
  };
}

export function drawGrayscaleImageGrid(
  grid: GrayscaleImageGrid,
  bounds: Bounds,
  options: Readonly<{
    maxLinesPerCell?: number;
  }> = {}
): readonly Polyline[] {
  const maxLinesPerCell = Math.max(1, Math.floor(options.maxLinesPerCell ?? 8));
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const cellWidth = width / grid.columns;
  const cellHeight = height / grid.rows;
  const paths: Polyline[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const darkness = 1 - valueAt(grid, column, row) / 255;
      const lineCount = Math.round(darkness * maxLinesPerCell);
      if (lineCount <= 0) {
        continue;
      }

      const cellX = bounds.minX + column * cellWidth;
      const cellY = bounds.maxY - (row + 1) * cellHeight;

      for (let index = 0; index < lineCount; index += 1) {
        const y = cellY + ((index + 1) * cellHeight) / (lineCount + 1);
        paths.push({
          points: [
            { x: cellX, y },
            { x: cellX + cellWidth, y },
          ],
        });
      }
    }
  }

  return paths;
}
