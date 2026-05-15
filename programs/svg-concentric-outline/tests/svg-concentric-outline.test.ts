import {
  calculateDocumentMetrics,
  normalizeParams,
  resolveProgramState,
  serializePlotDocumentToSvg,
  validatePlotDocument,
} from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import defaultSet from "../params/default.json";
import {
  program,
  type SvgConcentricOutlineProgramState,
} from "../index";
import { splitPathDataSubpaths } from "../svgImport";

function pathBounds(path: Readonly<{
  points: readonly Readonly<{
    x: number;
    y: number;
  }>[];
}>) {
  return path.points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );
}

function pathMidpoint(path: Readonly<{
  points: readonly Readonly<{
    x: number;
    y: number;
  }>[];
}>) {
  const bounds = pathBounds(path);
  return {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };
}

describe("svg-concentric-outline program", () => {
  it("renders deterministically from the checked-in default state", () => {
    const normalized = normalizeParams(program.params, defaultSet.params);
    const state = resolveProgramState(program, normalized.params, undefined);
    const renderInput = {
      programId: program.id,
      mode: "validation" as const,
      showDebug: true,
      caseName: "default",
      params: normalized.params,
      programState: state,
    };

    const first = program.render(renderInput);
    const second = program.render(renderInput);

    expect(serializePlotDocumentToSvg(first, { includeDebugLayers: true })).toEqual(
      serializePlotDocumentToSvg(second, { includeDebugLayers: true })
    );
    expect(validatePlotDocument(first).filter((issue) => issue.severity === "error")).toEqual([]);
    expect(calculateDocumentMetrics(first)).toMatchObject({
      artLayerCount: 1,
      debugLayerCount: 1,
      pathCount: 36,
    });
    expect(first.layers[0]?.paths).toHaveLength(36);
  });

  it("scales imported outlines down around the shared centroid", () => {
    const normalized = normalizeParams(program.params, {
      copies: 3,
      shrinkFactor: 0.5,
      shrinkStepMm: 0,
      sizeMm: 100,
    });
    const state: SvgConcentricOutlineProgramState = {
      sourceName: "square.svg",
      paths: [
        {
          closed: true,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    };

    const document = program.render({
      programId: program.id,
      mode: "preview",
      showDebug: false,
      params: normalized.params,
      programState: resolveProgramState(program, normalized.params, state),
    });
    const [outer, middle, inner] = document.layers[0]!.paths;
    const outerBounds = pathBounds(outer!);
    const middleBounds = pathBounds(middle!);
    const innerBounds = pathBounds(inner!);

    expect(document.layers[0]!.paths).toHaveLength(3);
    expect(outer?.closed).toBe(true);
    expect(middleBounds.maxY - middleBounds.minY).toBeCloseTo(
      (outerBounds.maxY - outerBounds.minY) * 0.5,
      6
    );
    expect(innerBounds.maxX - innerBounds.minX).toBeCloseTo(
      (outerBounds.maxX - outerBounds.minX) * 0.25,
      6
    );
  });

  it("supports shrinking successive copies by a fixed millimeter step", () => {
    const normalized = normalizeParams(program.params, {
      copies: 3,
      shrinkFactor: 1,
      shrinkStepMm: 10,
      sizeMm: 100,
    });
    const state: SvgConcentricOutlineProgramState = {
      sourceName: "square.svg",
      paths: [
        {
          closed: true,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 20 },
            { x: 0, y: 20 },
          ],
        },
      ],
    };

    const document = program.render({
      programId: program.id,
      mode: "preview",
      showDebug: false,
      params: normalized.params,
      programState: resolveProgramState(program, normalized.params, state),
    });
    const [outer, middle, inner] = document.layers[0]!.paths;
    const outerBounds = pathBounds(outer!);
    const middleBounds = pathBounds(middle!);
    const innerBounds = pathBounds(inner!);

    expect(document.layers[0]!.paths).toHaveLength(3);
    expect(outerBounds.maxY - outerBounds.minY).toBeCloseTo(100, 6);
    expect(middleBounds.maxY - middleBounds.minY).toBeCloseTo(90, 6);
    expect(innerBounds.maxY - innerBounds.minY).toBeCloseTo(80, 6);
  });

  it("keeps separate imported outlines anchored independently while shrinking", () => {
    const normalized = normalizeParams(program.params, {
      copies: 2,
      shrinkFactor: 0.5,
      shrinkStepMm: 0,
      sizeMm: 100,
    });
    const state: SvgConcentricOutlineProgramState = {
      sourceName: "double-line.svg",
      paths: [
        {
          closed: false,
          points: [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
          ],
        },
        {
          closed: false,
          points: [
            { x: 0, y: 100 },
            { x: 40, y: 100 },
          ],
        },
      ],
    };

    const document = program.render({
      programId: program.id,
      mode: "preview",
      showDebug: false,
      params: normalized.params,
      programState: resolveProgramState(program, normalized.params, state),
    });
    const [outerTop, outerBottom, innerTop, innerBottom] = document.layers[0]!.paths;

    expect(document.layers[0]!.paths).toHaveLength(4);
    expect(pathMidpoint(innerTop!).y).toBeCloseTo(pathMidpoint(outerTop!).y, 6);
    expect(pathMidpoint(innerBottom!).y).toBeCloseTo(pathMidpoint(outerBottom!).y, 6);
  });

  it("splits multi-subpath path data into separate outlines", () => {
    expect(
      splitPathDataSubpaths(
        "M0 0 L10 0 L10 10 Z M20 20 L30 20 L30 30 Z"
      )
    ).toEqual([
      "M 0 0 L 10 0 L 10 10 Z",
      "M 20 20 L 30 20 L 30 30 Z",
    ]);
  });

  it("preserves relative moveto placement when isolating later subpaths", () => {
    expect(splitPathDataSubpaths("M10 10 l5 0 m10 0 l5 0 z")).toEqual([
      "M 10 10 l 5 0",
      "M 25 10 l 5 0 z",
    ]);
  });
});
