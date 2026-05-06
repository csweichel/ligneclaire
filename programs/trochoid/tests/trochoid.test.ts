import { calculateDocumentMetrics, contentBounds } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender, renderProgramCase } from "../../test-helpers";
import { program } from "../index";
import defaultSet from "../params/default.json";

function pathSpan(points: readonly { x: number; y: number }[]): Readonly<{ width: number; height: number }> {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

describe("trochoid program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
    });
    const metrics = calculateDocumentMetrics(document);
    const defaultFigureCount =
      (
        defaultSet.programState as {
          figures?: readonly unknown[];
        }
      ).figures?.length ?? 0;

    expect(metrics.artLayerCount).toBe(1);
    expect(metrics.pathCount).toBe(defaultFigureCount);
  });

  it("renders one path per placed figure", () => {
    const document = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          figures: [
            {
              id: "figure-1",
              center: { x: 78, y: 148.5 },
              config: {
                useEpitrochoid: false,
                fixedRadius: 84,
                rollingRadius: 30,
                pointOffsetRatio: 0.82,
                figureRadius: 68,
                rotationDeg: 0,
                samplesPerTurn: 320,
              },
            },
            {
              id: "figure-2",
              center: { x: 132, y: 148.5 },
              config: {
                useEpitrochoid: true,
                fixedRadius: 64,
                rollingRadius: 18,
                pointOffsetRatio: 1.1,
                figureRadius: 34,
                rotationDeg: 42,
                samplesPerTurn: 180,
              },
            },
          ],
          selectedFigureId: "figure-2",
          nextFigureNumber: 3,
        },
      },
      {
        caseName: "default",
      }
    );

    expect(calculateDocumentMetrics(document).pathCount).toBe(2);

    const firstSpan = pathSpan(document.layers[0]!.paths[0]!.points);
    const secondSpan = pathSpan(document.layers[0]!.paths[1]!.points);

    expect(firstSpan.width).toBeGreaterThan(secondSpan.width);
    expect(firstSpan.height).toBeGreaterThan(secondSpan.height);
  });

  it("keeps figure size stable when a figure moves near the edge", () => {
    const centeredState = {
      figures: [
        {
          id: "figure-1",
          center: { x: 105, y: 148.5 },
          config: {
            useEpitrochoid: false,
            fixedRadius: 84,
            rollingRadius: 30,
            pointOffsetRatio: 0.82,
            figureRadius: 68,
            rotationDeg: 0,
            samplesPerTurn: 320,
          },
        },
      ],
      selectedFigureId: "figure-1",
      nextFigureNumber: 2,
    };
    const centered = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: centeredState,
      },
      {
        caseName: "default",
      }
    );
    const moved = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: {
          ...centeredState,
          figures: centeredState.figures.map((figure) => ({
            ...figure,
            center: { x: 132, y: 78 },
          })),
        },
      },
      {
        caseName: "default",
      }
    );

    const centeredSpan = pathSpan(centered.layers[0]!.paths[0]!.points);
    const movedSpan = pathSpan(moved.layers[0]!.paths[0]!.points);

    expect(movedSpan.width).toBeCloseTo(centeredSpan.width, 6);
    expect(movedSpan.height).toBeCloseTo(centeredSpan.height, 6);
  });

  it("supports oversized figure radii without shrinking them back to the fit radius", () => {
    const bounds = contentBounds(program.canvas);
    const centeredState = {
      figures: [
        {
          id: "figure-1",
          center: { x: 105, y: 148.5 },
          config: {
            useEpitrochoid: false,
            fixedRadius: 84,
            rollingRadius: 30,
            pointOffsetRatio: 0.82,
            figureRadius: 300,
            rotationDeg: 0,
            samplesPerTurn: 320,
          },
        },
      ],
      selectedFigureId: "figure-1",
      nextFigureNumber: 2,
    };
    const oversized = renderProgramCase(
      program,
      {
        ...defaultSet,
        programState: centeredState,
      },
      {
        caseName: "default",
      }
    );
    const oversizedSpan = pathSpan(oversized.layers[0]!.paths.flatMap((path) => path.points));
    const metrics = calculateDocumentMetrics(oversized);

    expect(oversizedSpan.width).toBeGreaterThan(150);
    expect(oversizedSpan.height).toBeGreaterThan(150);
    expect(metrics.boundingBoxMm?.minX).toBeGreaterThanOrEqual(bounds.minX);
    expect(metrics.boundingBoxMm?.maxX).toBeLessThanOrEqual(bounds.maxX);
    expect(metrics.boundingBoxMm?.minY).toBeGreaterThanOrEqual(bounds.minY);
    expect(metrics.boundingBoxMm?.maxY).toBeLessThanOrEqual(bounds.maxY);
  });

  it("migrates legacy shared params into per-figure config", () => {
    const migrated = program.migrateParamSet?.({
      programId: "trochoid",
      programVersion: "1.0.0",
      name: "Legacy",
      params: {
        useEpitrochoid: true,
        fixedRadius: 72,
        rollingRadius: 21,
        pointOffsetRatio: 1.15,
        figureRadius: 44,
        rotationDeg: 18,
        samplesPerTurn: 240,
      },
      programState: {
        figures: [
          {
            id: "figure-1",
            center: {
              x: 105,
              y: 148.5,
            },
          },
        ],
        selectedFigureId: "figure-1",
        nextFigureNumber: 2,
      },
      createdAt: "2026-05-05T12:30:00.000Z",
      updatedAt: "2026-05-05T12:30:00.000Z",
    });

    expect(migrated?.programVersion).toBe("1.1.0");
    expect(migrated?.params).toEqual({});
    const figures = (migrated?.programState as { figures: Array<{ config: Record<string, unknown> }> }).figures;
    expect(figures).toHaveLength(1);
    expect(figures[0]!.config).toMatchObject({
      useEpitrochoid: true,
      fixedRadius: 72,
      rollingRadius: 21,
      pointOffsetRatio: 1.15,
      figureRadius: 44,
      rotationDeg: 18,
      samplesPerTurn: 240,
    });
  });
});
