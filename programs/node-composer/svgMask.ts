import type { Bounds, Point, Polyline } from "@ligneclaire/sdk";

const SVG_MASK_DATA_VERSION = 1;
const DEFAULT_MASK_RASTER_DIMENSION = 384;
const DEFAULT_MASK_SIZE_MM = 120;
const SVG_MASK_ALPHA_THRESHOLD = 32;

export type SvgMaskFitMode = "contain" | "stretch";

export type SvgMaskData = Readonly<{
  columns: number;
  rows: number;
  bits: Uint8Array;
}>;

export type SvgMaskPlacement = Readonly<{
  center: Point;
  width: number;
  height: number;
  rotationDeg: number;
  fitMode: SvgMaskFitMode;
}>;

type SvgMaskPayload = Readonly<{
  version: number;
  columns: number;
  rows: number;
  bitsBase64: string;
}>;

export type LoadedSvgMask = Readonly<{
  encoded: string;
  data: SvgMaskData;
  sourceName: string;
}>;

function encodeBase64Bytes(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }

    return btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

function decodeBase64Bytes(encoded: string): Uint8Array {
  const binary =
    typeof atob === "function" ? atob(encoded) : Buffer.from(encoded, "base64").toString("binary");

  return Uint8Array.from(binary, (value) => value.charCodeAt(0));
}

function bitLength(columns: number, rows: number): number {
  return Math.ceil((columns * rows) / 8);
}

function getBit(bits: Uint8Array, index: number): boolean {
  const byte = bits[Math.floor(index / 8)];
  if (byte === undefined) {
    return false;
  }

  return (byte & (1 << (index % 8))) !== 0;
}

function setBit(bits: Uint8Array, index: number): void {
  const byteIndex = Math.floor(index / 8);
  bits[byteIndex] = (bits[byteIndex] ?? 0) | (1 << (index % 8));
}

function sanitizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : null;
}

function rotatePoint(point: Point, radians: number): Point {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function readSvgLength(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = /^-?\d*\.?\d+(?:e[+-]?\d+)?/i.exec(value.trim());
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readSvgIntrinsicSize(svgText: string): Readonly<{ width: number; height: number }> | null {
  if (typeof DOMParser === "undefined") {
    return null;
  }

  const document = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (document.querySelector("parsererror")) {
    return null;
  }

  const root = document.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") {
    return null;
  }

  const viewBox = root.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox
      .split(/[\s,]+/)
      .map((part) => Number(part))
      .filter((part) => Number.isFinite(part));

    if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
      return {
        width: parts[2]!,
        height: parts[3]!,
      };
    }
  }

  const width = readSvgLength(root.getAttribute("width"));
  const height = readSvgLength(root.getAttribute("height"));
  if (width && height) {
    return { width, height };
  }

  return null;
}

function maskRasterSize(
  aspectRatio: number,
  maxDimension = DEFAULT_MASK_RASTER_DIMENSION
): Readonly<{ width: number; height: number }> {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return {
      width: maxDimension,
      height: maxDimension,
    };
  }

  let width = maxDimension;
  let height = Math.max(1, Math.round(width / aspectRatio));

  if (height > maxDimension) {
    height = maxDimension;
    width = Math.max(1, Math.round(height * aspectRatio));
  }

  return { width, height };
}

function resolvePlacement(data: SvgMaskData, placement: SvgMaskPlacement): Readonly<{
  sourceCenter: Point;
  scaleX: number;
  scaleY: number;
  actualWidth: number;
  actualHeight: number;
  rotationRadians: number;
}> {
  const sourceWidth = Math.max(1, data.columns);
  const sourceHeight = Math.max(1, data.rows);
  const frameWidth = Math.max(1e-6, placement.width);
  const frameHeight = Math.max(1e-6, placement.height);

  if (placement.fitMode === "stretch") {
    return {
      sourceCenter: {
        x: sourceWidth * 0.5,
        y: sourceHeight * 0.5,
      },
      scaleX: frameWidth / sourceWidth,
      scaleY: frameHeight / sourceHeight,
      actualWidth: frameWidth,
      actualHeight: frameHeight,
      rotationRadians: (placement.rotationDeg / 180) * Math.PI,
    };
  }

  const scale = Math.min(frameWidth / sourceWidth, frameHeight / sourceHeight);

  return {
    sourceCenter: {
      x: sourceWidth * 0.5,
      y: sourceHeight * 0.5,
    },
    scaleX: scale,
    scaleY: scale,
    actualWidth: sourceWidth * scale,
    actualHeight: sourceHeight * scale,
    rotationRadians: (placement.rotationDeg / 180) * Math.PI,
  };
}

function frameCorners(
  center: Point,
  width: number,
  height: number,
  rotationDeg: number
): readonly Point[] {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const rotationRadians = (rotationDeg / 180) * Math.PI;
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ] as const;

  return corners.map((corner) => {
    const rotated = rotatePoint(corner, rotationRadians);
    return {
      x: center.x + rotated.x,
      y: center.y + rotated.y,
    };
  });
}

function boundsForPoints(points: readonly Point[]): Bounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function loadSvgImage(svgText: string): Promise<HTMLImageElement> {
  if (typeof Image === "undefined" || typeof URL === "undefined") {
    throw new Error("SVG mask uploads are only available in the browser editor.");
  }

  const blob = new Blob([svgText], {
    type: "image/svg+xml;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to load the selected SVG."));
    };
    image.src = objectUrl;
  });
}

export function encodeSvgMaskData(data: SvgMaskData): string {
  const payload: SvgMaskPayload = {
    version: SVG_MASK_DATA_VERSION,
    columns: data.columns,
    rows: data.rows,
    bitsBase64: encodeBase64Bytes(data.bits),
  };

  return encodeBase64Bytes(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeSvgMaskData(encoded: string): SvgMaskData | null {
  if (typeof encoded !== "string" || encoded.trim().length === 0) {
    return null;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Bytes(encoded))) as SvgMaskPayload;
    const columns = sanitizePositiveInteger(payload.columns);
    const rows = sanitizePositiveInteger(payload.rows);

    if (
      payload.version !== SVG_MASK_DATA_VERSION ||
      columns === null ||
      rows === null ||
      typeof payload.bitsBase64 !== "string"
    ) {
      return null;
    }

    const bits = decodeBase64Bytes(payload.bitsBase64);
    if (bits.length !== bitLength(columns, rows)) {
      return null;
    }

    return {
      columns,
      rows,
      bits,
    };
  } catch {
    return null;
  }
}

export function suggestSvgMaskSize(
  data: SvgMaskData,
  maxDimension = DEFAULT_MASK_SIZE_MM
): Readonly<{ width: number; height: number }> {
  const aspectRatio = data.columns / Math.max(1, data.rows);

  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return {
      width: maxDimension,
      height: maxDimension,
    };
  }

  if (aspectRatio >= 1) {
    return {
      width: maxDimension,
      height: Math.max(16, maxDimension / aspectRatio),
    };
  }

  return {
    width: Math.max(16, maxDimension * aspectRatio),
    height: maxDimension,
  };
}

export function svgMaskFramePath(data: SvgMaskData, placement: SvgMaskPlacement): Polyline {
  const resolved = resolvePlacement(data, placement);

  return {
    points: [...frameCorners(placement.center, resolved.actualWidth, resolved.actualHeight, placement.rotationDeg)],
    closed: true,
  };
}

export function svgMaskFrameBounds(data: SvgMaskData, placement: SvgMaskPlacement): Bounds {
  return boundsForPoints(svgMaskFramePath(data, placement).points);
}

export function pointInSvgMask(point: Point, data: SvgMaskData, placement: SvgMaskPlacement): boolean {
  const resolved = resolvePlacement(data, placement);
  if (Math.abs(resolved.scaleX) < 1e-6 || Math.abs(resolved.scaleY) < 1e-6) {
    return false;
  }

  const translated = {
    x: point.x - placement.center.x,
    y: point.y - placement.center.y,
  };
  const unrotated = rotatePoint(translated, -resolved.rotationRadians);
  const sourcePoint = {
    x: resolved.sourceCenter.x + unrotated.x / resolved.scaleX,
    y: resolved.sourceCenter.y + unrotated.y / resolved.scaleY,
  };

  if (
    sourcePoint.x < 0 ||
    sourcePoint.y < 0 ||
    sourcePoint.x > data.columns ||
    sourcePoint.y > data.rows
  ) {
    return false;
  }

  const column = Math.max(0, Math.min(data.columns - 1, Math.floor(sourcePoint.x)));
  const row = Math.max(0, Math.min(data.rows - 1, Math.floor(sourcePoint.y)));

  return getBit(data.bits, row * data.columns + column);
}

export async function loadSvgMaskFile(file: File): Promise<LoadedSvgMask> {
  if (typeof document === "undefined") {
    throw new Error("SVG mask uploads are only available in the browser editor.");
  }

  const svgText = await file.text();
  if (!svgText.includes("<svg")) {
    throw new Error("The selected file is not valid SVG markup.");
  }

  const intrinsicSize = readSvgIntrinsicSize(svgText);
  const aspectRatio =
    intrinsicSize && intrinsicSize.width > 0 && intrinsicSize.height > 0
      ? intrinsicSize.width / intrinsicSize.height
      : 1;
  const rasterSize = maskRasterSize(aspectRatio);
  const image = await loadSvgImage(svgText);
  const canvas = document.createElement("canvas");
  canvas.width = rasterSize.width;
  canvas.height = rasterSize.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create a 2D canvas for SVG mask import.");
  }

  context.clearRect(0, 0, rasterSize.width, rasterSize.height);
  context.drawImage(image, 0, 0, rasterSize.width, rasterSize.height);

  const imageData = context.getImageData(0, 0, rasterSize.width, rasterSize.height);
  const alphas = imageData.data;
  let minX = rasterSize.width;
  let minY = rasterSize.height;
  let maxX = -1;
  let maxY = -1;

  for (let row = 0; row < rasterSize.height; row += 1) {
    for (let column = 0; column < rasterSize.width; column += 1) {
      const alpha = alphas[(row * rasterSize.width + column) * 4 + 3] ?? 0;
      if (alpha < SVG_MASK_ALPHA_THRESHOLD) {
        continue;
      }

      minX = Math.min(minX, column);
      minY = Math.min(minY, row);
      maxX = Math.max(maxX, column);
      maxY = Math.max(maxY, row);
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("The selected SVG does not produce any visible mask area.");
  }

  const columns = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const bits = new Uint8Array(bitLength(columns, rows));

  for (let row = 0; row < rows; row += 1) {
    const sourceRow = maxY - row;

    for (let column = 0; column < columns; column += 1) {
      const alpha = alphas[(sourceRow * rasterSize.width + (minX + column)) * 4 + 3] ?? 0;
      if (alpha >= SVG_MASK_ALPHA_THRESHOLD) {
        setBit(bits, row * columns + column);
      }
    }
  }

  const data: SvgMaskData = {
    columns,
    rows,
    bits,
  };

  return {
    encoded: encodeSvgMaskData(data),
    data,
    sourceName: file.name || "mask.svg",
  };
}
