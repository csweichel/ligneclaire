import type { Point } from "@ligneclaire/sdk";

type CsvDataLine = Readonly<{
  lineNumber: number;
  text: string;
}>;

const CSV_SPLIT_PATTERN = /[,\t;]+/;

function tokenizeCsvLine(line: string): readonly string[] {
  return line.split(CSV_SPLIT_PATTERN).map((field) => field.trim());
}

function isFiniteNumericField(value: string | undefined): boolean {
  if (value === undefined || value.length === 0) {
    return false;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed);
}

function findHeaderIndex(fields: readonly string[], axis: "x" | "y"): number {
  const axisPattern = axis === "x" ? /^x(?:[_\s-]*mm)?$/i : /^y(?:[_\s-]*mm)?$/i;
  const suffixPattern = axis === "x" ? /(^|[_\s-])x($|[_\s-])/i : /(^|[_\s-])y($|[_\s-])/i;

  for (let index = 0; index < fields.length; index += 1) {
    if (axisPattern.test(fields[index] ?? "")) {
      return index;
    }
  }

  for (let index = 0; index < fields.length; index += 1) {
    if (suffixPattern.test(fields[index] ?? "")) {
      return index;
    }
  }

  return -1;
}

function collectDataLines(csvText: string): readonly CsvDataLine[] {
  return csvText
    .split(/\r?\n/)
    .map((text, index) => ({
      lineNumber: index + 1,
      text: text.trim(),
    }))
    .filter((line) => line.text.length > 0 && !line.text.startsWith("#"));
}

export function parseHamiltonGuideCsv(csvText: string): readonly Point[] {
  if (csvText.trim().length === 0) {
    throw new Error("The CSV file is empty.");
  }

  const dataLines = collectDataLines(csvText);
  if (dataLines.length === 0) {
    throw new Error("The CSV file does not contain any guide points.");
  }

  const firstFields = tokenizeCsvLine(dataLines[0]!.text);
  if (firstFields.length < 2) {
    throw new Error("Each CSV row must provide at least two columns for X and Y.");
  }

  let xIndex = 0;
  let yIndex = 1;
  let startIndex = 0;

  if (!isFiniteNumericField(firstFields[0]) || !isFiniteNumericField(firstFields[1])) {
    xIndex = findHeaderIndex(firstFields, "x");
    yIndex = findHeaderIndex(firstFields, "y");

    if (xIndex < 0 || yIndex < 0) {
      throw new Error('CSV headers must include "x" and "y" columns when a header row is present.');
    }

    startIndex = 1;
  }

  const points: Point[] = [];

  for (const line of dataLines.slice(startIndex)) {
    const fields = tokenizeCsvLine(line.text);
    const rawX = fields[xIndex];
    const rawY = fields[yIndex];

    if (!isFiniteNumericField(rawX) || !isFiniteNumericField(rawY)) {
      throw new Error(`Invalid guide point on line ${line.lineNumber}. Expected numeric X and Y values.`);
    }

    points.push({
      x: Number(rawX),
      y: Number(rawY),
    });
  }

  if (points.length === 0) {
    throw new Error("The CSV file does not contain any guide points.");
  }

  return points;
}
