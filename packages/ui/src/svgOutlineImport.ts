import type { Point } from "@ligneclaire/sdk";

const EPSILON = 1e-6;
const MAX_POINTS_PER_ELEMENT = 720;
const MIN_CLOSED_SAMPLES = 32;
const MIN_OPEN_SAMPLES = 12;
const PATH_DATA_TOKEN_PATTERN =
  /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
const PATH_COMMAND_PATTERN = /^[AaCcHhLlMmQqSsTtVvZz]$/;
const PATH_PARAMETER_COUNTS = {
  A: 7,
  C: 6,
  H: 1,
  L: 2,
  M: 2,
  Q: 4,
  S: 4,
  T: 2,
  V: 1,
  Z: 0,
} as const;

export type ImportedSvgOutlinePath = Readonly<{
  closed: boolean;
  points: readonly Point[];
}>;

export type ImportedSvgOutlineData = Readonly<{
  sourceName: string;
  paths: readonly ImportedSvgOutlinePath[];
}>;

type PathCommand = Readonly<{
  command: string;
  args: readonly number[];
}>;

function distanceBetweenPoints(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function dedupePoints(points: readonly Point[]): Point[] {
  const deduped: Point[] = [];

  for (const point of points) {
    if (
      deduped.length > 0 &&
      distanceBetweenPoints(deduped.at(-1)!, point) <= EPSILON
    ) {
      continue;
    }

    deduped.push({
      x: point.x,
      y: point.y,
    });
  }

  return deduped;
}

function sanitizeImportedSvgOutlinePath(input: unknown): ImportedSvgOutlinePath | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const pointsValue = Array.isArray(candidate.points) ? candidate.points : [];
  const points = dedupePoints(
    pointsValue.flatMap((value) => {
      if (!value || typeof value !== "object") {
        return [];
      }

      const point = value as Record<string, unknown>;
      if (
        typeof point.x !== "number" ||
        !Number.isFinite(point.x) ||
        typeof point.y !== "number" ||
        !Number.isFinite(point.y)
      ) {
        return [];
      }

      return [
        {
          x: point.x,
          y: point.y,
        },
      ];
    })
  );
  const closed = candidate.closed === true;

  if (
    closed &&
    points.length > 2 &&
    distanceBetweenPoints(points[0]!, points.at(-1)!) <= EPSILON
  ) {
    points.pop();
  }

  if (points.length < (closed ? 3 : 2)) {
    return null;
  }

  return {
    closed,
    points,
  };
}

export function emptyImportedSvgOutlineData(): ImportedSvgOutlineData {
  return {
    sourceName: "",
    paths: [],
  };
}

export function normalizeImportedSvgOutlineData(input: unknown): ImportedSvgOutlineData {
  if (!input || typeof input !== "object") {
    return emptyImportedSvgOutlineData();
  }

  const candidate = input as Record<string, unknown>;
  const pathsValue = Array.isArray(candidate.paths) ? candidate.paths : [];
  const paths = pathsValue.flatMap((value) => {
    const sanitized = sanitizeImportedSvgOutlinePath(value);
    return sanitized ? [sanitized] : [];
  });
  const sourceName =
    typeof candidate.sourceName === "string" && candidate.sourceName.trim().length > 0
      ? candidate.sourceName.trim()
      : paths.length > 0
        ? "imported-outline.svg"
        : "";

  return {
    sourceName,
    paths,
  };
}

export function countImportedSvgOutlinePoints(state: ImportedSvgOutlineData): number {
  return state.paths.reduce((total, path) => total + path.points.length, 0);
}

function isPathCommandToken(token: string): boolean {
  return PATH_COMMAND_PATTERN.test(token);
}

function formatPathCommand(command: PathCommand): string {
  if (command.args.length === 0) {
    return command.command;
  }

  return `${command.command} ${command.args.map((value) => String(value)).join(" ")}`;
}

function parsePathCommands(pathData: string): PathCommand[] | null {
  const tokens = pathData.match(PATH_DATA_TOKEN_PATTERN);
  if (!tokens || tokens.length === 0) {
    return null;
  }

  const commands: PathCommand[] = [];
  let cursor = 0;
  let currentCommand: string | null = null;

  while (cursor < tokens.length) {
    const token = tokens[cursor]!;
    if (isPathCommandToken(token)) {
      currentCommand = token;
      cursor += 1;
    } else if (!currentCommand) {
      return null;
    }

    if (!currentCommand) {
      return null;
    }

    const parameterCount =
      PATH_PARAMETER_COUNTS[
        currentCommand.toUpperCase() as keyof typeof PATH_PARAMETER_COUNTS
      ];
    if (parameterCount === undefined) {
      return null;
    }

    if (parameterCount === 0) {
      commands.push({
        command: currentCommand,
        args: [],
      });
      currentCommand = null;
      continue;
    }

    const args: number[] = [];
    while (cursor < tokens.length && !isPathCommandToken(tokens[cursor]!)) {
      const parsed = Number(tokens[cursor]!);
      if (!Number.isFinite(parsed)) {
        return null;
      }

      args.push(parsed);
      cursor += 1;
    }

    if (args.length === 0 || args.length % parameterCount !== 0) {
      return null;
    }

    commands.push({
      command: currentCommand,
      args,
    });
  }

  return commands;
}

function advancePathPosition(
  command: PathCommand,
  current: Point,
  subpathStart: Point
): Readonly<{
  current: Point;
  subpathStart: Point;
}> {
  const relative = command.command === command.command.toLowerCase();
  const nextCurrent = {
    x: current.x,
    y: current.y,
  };

  switch (command.command.toUpperCase()) {
    case "A": {
      for (let index = 0; index < command.args.length; index += 7) {
        const targetX = command.args[index + 5]!;
        const targetY = command.args[index + 6]!;
        nextCurrent.x = relative ? nextCurrent.x + targetX : targetX;
        nextCurrent.y = relative ? nextCurrent.y + targetY : targetY;
      }
      break;
    }

    case "C": {
      for (let index = 0; index < command.args.length; index += 6) {
        const targetX = command.args[index + 4]!;
        const targetY = command.args[index + 5]!;
        nextCurrent.x = relative ? nextCurrent.x + targetX : targetX;
        nextCurrent.y = relative ? nextCurrent.y + targetY : targetY;
      }
      break;
    }

    case "H": {
      for (const value of command.args) {
        nextCurrent.x = relative ? nextCurrent.x + value : value;
      }
      break;
    }

    case "L":
    case "T": {
      for (let index = 0; index < command.args.length; index += 2) {
        const targetX = command.args[index]!;
        const targetY = command.args[index + 1]!;
        nextCurrent.x = relative ? nextCurrent.x + targetX : targetX;
        nextCurrent.y = relative ? nextCurrent.y + targetY : targetY;
      }
      break;
    }

    case "Q":
    case "S": {
      for (let index = 0; index < command.args.length; index += 4) {
        const targetX = command.args[index + 2]!;
        const targetY = command.args[index + 3]!;
        nextCurrent.x = relative ? nextCurrent.x + targetX : targetX;
        nextCurrent.y = relative ? nextCurrent.y + targetY : targetY;
      }
      break;
    }

    case "V": {
      for (const value of command.args) {
        nextCurrent.y = relative ? nextCurrent.y + value : value;
      }
      break;
    }

    case "Z": {
      nextCurrent.x = subpathStart.x;
      nextCurrent.y = subpathStart.y;
      break;
    }

    default:
      break;
  }

  return {
    current: nextCurrent,
    subpathStart,
  };
}

export function splitSvgPathDataSubpaths(pathData: string): string[] {
  const trimmed = pathData.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const commands = parsePathCommands(trimmed);
  if (!commands || commands.length === 0 || commands[0]!.command.toUpperCase() !== "M") {
    return [trimmed];
  }

  const subpaths: string[] = [];
  let currentSubpath: PathCommand[] = [];
  let currentPoint: Point = {
    x: 0,
    y: 0,
  };
  let subpathStart: Point = {
    x: 0,
    y: 0,
  };

  const flushSubpath = () => {
    if (currentSubpath.length === 0) {
      return;
    }

    subpaths.push(currentSubpath.map((command) => formatPathCommand(command)).join(" "));
    currentSubpath = [];
  };

  for (const command of commands) {
    if (command.command.toUpperCase() === "M") {
      const relative = command.command === "m";
      const targetX = relative
        ? currentPoint.x + command.args[0]!
        : command.args[0]!;
      const targetY = relative
        ? currentPoint.y + command.args[1]!
        : command.args[1]!;

      flushSubpath();

      currentPoint = {
        x: targetX,
        y: targetY,
      };
      subpathStart = {
        x: targetX,
        y: targetY,
      };
      currentSubpath = [
        {
          command: "M",
          args: [targetX, targetY],
        },
      ];

      if (command.args.length > 2) {
        const implicitLine: PathCommand = {
          command: relative ? "l" : "L",
          args: command.args.slice(2),
        };
        currentSubpath.push(implicitLine);
        currentPoint = advancePathPosition(
          implicitLine,
          currentPoint,
          subpathStart
        ).current;
      }

      continue;
    }

    currentSubpath.push(command);
    const advanced = advancePathPosition(command, currentPoint, subpathStart);
    currentPoint = advanced.current;
    subpathStart = advanced.subpathStart;
  }

  flushSubpath();

  return subpaths.length > 0 ? subpaths : [trimmed];
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

function svgIntrinsicSize(root: SVGSVGElement): Readonly<{
  width: number;
  height: number;
}> {
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
    return {
      width,
      height,
    };
  }

  return {
    width: 1000,
    height: 1000,
  };
}

function mountSvg(svgText: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("The selected file is not valid SVG markup.");
  }

  const root = parsed.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") {
    throw new Error("The selected file does not contain a root <svg> element.");
  }

  const mounted = root.cloneNode(true) as SVGSVGElement;
  const size = svgIntrinsicSize(mounted);
  mounted.setAttribute("width", String(size.width));
  mounted.setAttribute("height", String(size.height));
  mounted.style.display = "block";
  mounted.style.overflow = "visible";

  const host = document.createElement("div");
  host.setAttribute("data-svg-outline-import", "true");
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "-100000px";
  host.style.width = "0";
  host.style.height = "0";
  host.style.opacity = "0";
  host.style.pointerEvents = "none";
  host.style.overflow = "hidden";
  host.appendChild(mounted);
  document.body.appendChild(host);

  return mounted;
}

function isRenderableGeometryElement(element: SVGGeometryElement): boolean {
  if (element.closest("defs,clipPath,mask,pattern,marker,symbol")) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return true;
}

function pathClosed(element: SVGGeometryElement): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "polygon" || tagName === "rect" || tagName === "circle" || tagName === "ellipse") {
    return true;
  }

  if (tagName === "path") {
    const d = element.getAttribute("d") ?? "";
    return /[zZ]/.test(d);
  }

  return false;
}

function transformPoint(point: Point, matrix: DOMMatrix | null): Point {
  if (!matrix) {
    return point;
  }

  const transformed = new DOMPoint(point.x, point.y).matrixTransform(matrix);
  return {
    x: transformed.x,
    y: transformed.y,
  };
}

function sampleSingleGeometryElement(
  element: SVGGeometryElement
): ImportedSvgOutlinePath | null {
  if (!isRenderableGeometryElement(element)) {
    return null;
  }

  const totalLength = element.getTotalLength();
  if (!Number.isFinite(totalLength) || totalLength <= EPSILON) {
    return null;
  }

  const closed = pathClosed(element);
  const matrix = element.getCTM();
  const sampleCount = Math.max(
    closed ? MIN_CLOSED_SAMPLES : MIN_OPEN_SAMPLES,
    Math.min(MAX_POINTS_PER_ELEMENT, Math.ceil(totalLength / 4))
  );
  const points = dedupePoints(
    Array.from({ length: sampleCount + 1 }, (_, index) => {
      const local = element.getPointAtLength((totalLength * index) / sampleCount);
      return transformPoint(
        {
          x: local.x,
          y: local.y,
        },
        matrix
      );
    })
  );

  if (
    closed &&
    points.length > 2 &&
    distanceBetweenPoints(points[0]!, points.at(-1)!) <= EPSILON
  ) {
    points.pop();
  }

  if (points.length < (closed ? 3 : 2)) {
    return null;
  }

  return {
    closed,
    points,
  };
}

function sampleGeometryElement(element: SVGGeometryElement): ImportedSvgOutlinePath[] {
  if (!(element instanceof SVGPathElement)) {
    const sampled = sampleSingleGeometryElement(element);
    return sampled ? [sampled] : [];
  }

  const subpaths = splitSvgPathDataSubpaths(element.getAttribute("d") ?? "");
  if (subpaths.length <= 1 || !element.parentElement) {
    const sampled = sampleSingleGeometryElement(element);
    return sampled ? [sampled] : [];
  }

  const insertionPoint = element.nextSibling;
  const clones = subpaths.map((subpath) => {
    const clone = element.cloneNode(false) as SVGPathElement;
    clone.setAttribute("d", subpath);
    element.parentElement!.insertBefore(clone, insertionPoint);
    return clone;
  });

  try {
    return clones.flatMap((clone) => {
      const sampled = sampleSingleGeometryElement(clone);
      return sampled ? [sampled] : [];
    });
  } finally {
    clones.forEach((clone) => clone.remove());
  }
}

export async function importSvgOutlineFile(file: File): Promise<ImportedSvgOutlineData> {
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    throw new Error("SVG import is only available in the browser editor.");
  }

  const svgText = await file.text();
  if (!svgText.includes("<svg")) {
    throw new Error("The selected file is not valid SVG markup.");
  }

  const mounted = mountSvg(svgText);

  try {
    const geometries = Array.from(
      mounted.querySelectorAll(
        "path, circle, ellipse, line, polygon, polyline, rect"
      )
    ) as SVGGeometryElement[];
    const paths = geometries.flatMap((geometry) => sampleGeometryElement(geometry));

    if (paths.length === 0) {
      throw new Error("The selected SVG does not contain any supported visible outline geometry.");
    }

    return normalizeImportedSvgOutlineData({
      sourceName: file.name || "imported-outline.svg",
      paths,
    });
  } finally {
    mounted.parentElement?.remove();
  }
}
