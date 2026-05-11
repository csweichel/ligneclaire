// @ts-expect-error opentype.js does not ship TypeScript declarations.
import opentype from "opentype.js";
import {
  clamp,
  distanceBetweenPoints,
  sampleCubicBezier,
  sampleQuadraticBezier,
  type Bounds,
  type Point,
  type Polyline,
} from "@ligneclaire/sdk";
import {
  googleTextFontBase64,
  googleTextFonts,
  isGoogleTextFontId,
  type GoogleTextFontId,
} from "./text-fonts";

const CURVE_SAMPLE_STEP_MM = 1.25;
const DEFAULT_LINE_HEIGHT_RATIO = 1.2;
const DEFAULT_FONT_WEIGHT = 400;

type OpenTypeAxis = Readonly<{
  tag: string;
  minValue: number;
  defaultValue: number;
  maxValue: number;
}>;

type OpenTypeCommand =
  | Readonly<{ type: "M"; x: number; y: number }>
  | Readonly<{ type: "L"; x: number; y: number }>
  | Readonly<{ type: "Q"; x1: number; y1: number; x: number; y: number }>
  | Readonly<{ type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }>
  | Readonly<{ type: "Z" }>;

type OpenTypePath = Readonly<{
  commands: readonly OpenTypeCommand[];
}>;

type OpenTypeGlyph = Readonly<{
  advanceWidth?: number;
  getPath: (
    x: number,
    y: number,
    fontSize: number,
    options?: Readonly<{ variation?: Readonly<Record<string, number>> }>,
    font?: OpenTypeFont
  ) => OpenTypePath;
}>;

type OpenTypeFont = Readonly<{
  unitsPerEm: number;
  ascender: number;
  descender: number;
  charToGlyph: (character: string) => OpenTypeGlyph;
  getKerningValue?: (left: OpenTypeGlyph, right: OpenTypeGlyph) => number;
  tables?: Readonly<{
    fvar?: Readonly<{
      axes?: readonly OpenTypeAxis[];
    }>;
  }>;
}>;

export type TextPathOptions = Readonly<{
  center: Point;
  text: string;
  fontId: string;
  fontSize: number;
  fontWeight?: number;
  rotationDeg?: number;
  lineHeight?: number;
  fontDataBase64?: string;
  fontCacheKey?: string;
}>;

export type TextPathResult = Readonly<{
  paths: readonly Polyline[];
  bounds: Bounds | null;
}>;

const fontCache = new Map<string, OpenTypeFont>();

export { googleTextFonts };
export type { GoogleTextFontId };

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

function loadFont(options: Readonly<{
  fontId: string;
  fontDataBase64?: string;
  fontCacheKey?: string;
}>): OpenTypeFont {
  const cacheKey = options.fontCacheKey ?? options.fontId;
  const cached = fontCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const base64 = options.fontDataBase64
    ? options.fontDataBase64
    : isGoogleTextFontId(options.fontId)
      ? googleTextFontBase64(options.fontId)
      : googleTextFontBase64("inter");
  const font = opentype.parse(base64ToArrayBuffer(base64)) as OpenTypeFont;
  fontCache.set(cacheKey, font);
  return font;
}

function contourBounds(points: readonly Point[]): Bounds | null {
  if (points.length === 0) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function pathsBounds(paths: readonly Polyline[]): Bounds | null {
  let result: Bounds | null = null;

  for (const path of paths) {
    const bounds = contourBounds(path.points);
    if (!bounds) {
      continue;
    }

    result = result
      ? {
          minX: Math.min(result.minX, bounds.minX),
          minY: Math.min(result.minY, bounds.minY),
          maxX: Math.max(result.maxX, bounds.maxX),
          maxY: Math.max(result.maxY, bounds.maxY),
        }
      : bounds;
  }

  return result;
}

function rotatePoint(point: Point, radians: number): Point {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function sampleCount(points: readonly Point[]): number {
  let length = 0;

  for (let index = 1; index < points.length; index += 1) {
    length += distanceBetweenPoints(points[index - 1]!, points[index]!);
  }

  return clamp(Math.ceil(length / CURVE_SAMPLE_STEP_MM), 4, 48);
}

function appendUniquePoint(target: Point[], point: Point): void {
  const last = target.at(-1);
  if (last && Math.abs(last.x - point.x) < 1e-6 && Math.abs(last.y - point.y) < 1e-6) {
    return;
  }

  target.push(point);
}

function fromOpenTypePoint(x: number, y: number): Point {
  return {
    x,
    y: -y,
  };
}

function pathToPolylines(path: OpenTypePath): readonly Polyline[] {
  const contours: Polyline[] = [];
  let current: Point[] = [];
  let start: Point | null = null;
  let cursor: Point | null = null;

  const flush = (closed: boolean) => {
    if (current.length > 1) {
      const contourClosed =
        closed ||
        (current.length > 2 &&
          Math.abs(current[0]!.x - current.at(-1)!.x) < 1e-6 &&
          Math.abs(current[0]!.y - current.at(-1)!.y) < 1e-6);

      if (contourClosed && current.length > 2) {
        current = [...current];
        current.pop();
      }

      contours.push({
        points: current,
        closed: contourClosed,
      });
    }
    current = [];
    start = null;
  };

  for (const command of path.commands) {
    if (command.type === "M") {
      flush(false);
      start = fromOpenTypePoint(command.x, command.y);
      cursor = start;
      current.push(start);
      continue;
    }

    if (!cursor) {
      continue;
    }

    if (command.type === "L") {
      cursor = fromOpenTypePoint(command.x, command.y);
      appendUniquePoint(current, cursor);
      continue;
    }

    if (command.type === "Q") {
      const control = fromOpenTypePoint(command.x1, command.y1);
      const end = fromOpenTypePoint(command.x, command.y);
      const sampled = sampleQuadraticBezier(
        cursor,
        control,
        end,
        sampleCount([
          cursor,
          control,
          end,
        ])
      ).points;
      for (const point of sampled.slice(1)) {
        appendUniquePoint(current, point);
      }
      cursor = end;
      continue;
    }

    if (command.type === "C") {
      const control1 = fromOpenTypePoint(command.x1, command.y1);
      const control2 = fromOpenTypePoint(command.x2, command.y2);
      const end = fromOpenTypePoint(command.x, command.y);
      const sampled = sampleCubicBezier(
        cursor,
        control1,
        control2,
        end,
        sampleCount([
          cursor,
          control1,
          control2,
          end,
        ])
      ).points;
      for (const point of sampled.slice(1)) {
        appendUniquePoint(current, point);
      }
      cursor = end;
      continue;
    }

    if (command.type === "Z") {
      if (start) {
        appendUniquePoint(current, start);
      }
      flush(true);
      cursor = start;
    }
  }

  flush(false);
  return contours;
}

function variationForFont(
  font: OpenTypeFont,
  fontWeight: number,
  fontSize: number
): Readonly<Record<string, number>> | undefined {
  const axes = font.tables?.fvar?.axes;
  if (!axes || axes.length === 0) {
    return undefined;
  }

  const variation: Record<string, number> = {};

  for (const axis of axes) {
    if (axis.tag === "wght") {
      variation.wght = clamp(fontWeight, axis.minValue, axis.maxValue);
      continue;
    }

    if (axis.tag === "opsz") {
      variation.opsz = clamp(fontSize, axis.minValue, axis.maxValue);
    }
  }

  return variation;
}

function lineAdvance(font: OpenTypeFont, line: string, fontSize: number): number {
  const scale = fontSize / font.unitsPerEm;
  let x = 0;
  let previous: OpenTypeGlyph | null = null;

  for (const character of line) {
    const glyph = font.charToGlyph(character);
    if (previous && font.getKerningValue) {
      x += font.getKerningValue(previous, glyph) * scale;
    }
    x += (glyph.advanceWidth ?? font.unitsPerEm) * scale;
    previous = glyph;
  }

  return x;
}

export function generateTextPaths(options: TextPathOptions): TextPathResult {
  if (options.text.trim().length === 0 || options.fontSize <= 0) {
    return {
      paths: [],
      bounds: null,
    };
  }

  const font = loadFont({
    fontId: options.fontId,
    fontDataBase64: options.fontDataBase64,
    fontCacheKey: options.fontCacheKey,
  });
  const fontWeight = options.fontWeight ?? DEFAULT_FONT_WEIGHT;
  const variation = variationForFont(font, fontWeight, options.fontSize);
  const lines = options.text.split(/\r?\n/);
  const lineHeight = options.lineHeight ?? options.fontSize * DEFAULT_LINE_HEIGHT_RATIO;
  const scale = options.fontSize / font.unitsPerEm;
  const ascent = font.ascender * scale;
  const paths: Polyline[] = [];
  const lineWidths = lines.map((line) => lineAdvance(font, line, options.fontSize));
  const maxLineWidth = Math.max(...lineWidths, 0);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    let cursorX = (maxLineWidth - lineWidths[lineIndex]!) * -0.5;
    const baselineY = ascent - lineIndex * lineHeight;
    let previous: OpenTypeGlyph | null = null;

    for (const character of line) {
      const glyph = font.charToGlyph(character);
      if (previous && font.getKerningValue) {
        cursorX += font.getKerningValue(previous, glyph) * scale;
      }

      const glyphPath = glyph.getPath(cursorX, baselineY, options.fontSize, {
        variation,
      }, font);
      paths.push(...pathToPolylines(glyphPath));
      cursorX += (glyph.advanceWidth ?? font.unitsPerEm) * scale;
      previous = glyph;
    }
  }

  const bounds = pathsBounds(paths);
  if (!bounds) {
    return {
      paths: [],
      bounds: null,
    };
  }

  const center = {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };
  const rotationRadians = ((options.rotationDeg ?? 0) / 180) * Math.PI;

  const transformedPaths = paths.map((path) => ({
    ...path,
    points: path.points.map((point) => {
      const translated = {
        x: point.x - center.x,
        y: point.y - center.y,
      };
      const rotated =
        rotationRadians === 0 ? translated : rotatePoint(translated, rotationRadians);

      return {
        x: options.center.x + rotated.x,
        y: options.center.y + rotated.y,
      };
    }),
  }));

  return {
    paths: transformedPaths,
    bounds: pathsBounds(transformedPaths),
  };
}
