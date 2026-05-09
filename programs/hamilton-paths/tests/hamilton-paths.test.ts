import { calculateDocumentMetrics, contentBounds } from "@ligneclaire/sdk";
import { describe, expect, it } from "vitest";
import { expectDeterministicProgramRender } from "../../test-helpers";
import { program } from "../index";
import defaultSet from "../params/default.json";

describe("hamilton-paths program", () => {
  it("renders deterministically from the checked-in default parameter set", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
    });
    const metrics = calculateDocumentMetrics(document);

    expect(metrics.artLayerCount).toBe(1);
    expect(document.layers[0]?.paths).toHaveLength(defaultSet.params.strokeCount);
    expect(
      document.layers[0]?.paths.every(
        (path) => path.points.length > defaultSet.params.rows * defaultSet.params.columns
      )
    ).toBe(true);
  });

  it("keeps every stroke inside the printable content bounds", () => {
    const document = expectDeterministicProgramRender(program, defaultSet, {
      caseName: "default",
    });
    const bounds = contentBounds(document.canvas);

    expect(
      document.layers.every((layer) =>
        layer.paths.every((path) =>
          path.points.every(
            (point) =>
              point.x >= bounds.minX - 1e-6 &&
              point.x <= bounds.maxX + 1e-6 &&
              point.y >= bounds.minY - 1e-6 &&
              point.y <= bounds.maxY + 1e-6
          )
        )
      )
    ).toBe(true);
  });

  it("keeps zero-deflection unrounded straight runs orthogonal", () => {
    const document = expectDeterministicProgramRender(
      program,
      {
        ...defaultSet,
        params: {
          ...defaultSet.params,
          cornerRadius: 0,
          deflection: 0,
        },
      },
      {
        caseName: "default",
      }
    );

    expect(
      document.layers.every((layer) =>
        layer.paths.every((path) =>
          path.points.slice(1).every((point, index) => {
            const previous = path.points[index]!;
            return (
              Math.abs(point.x - previous.x) < 1e-6 ||
              Math.abs(point.y - previous.y) < 1e-6
            );
          })
        )
      )
    ).toBe(true);
  });

  it("emits one fewer path when drawing centerlines", () => {
    const document = expectDeterministicProgramRender(
      program,
      {
        ...defaultSet,
        params: {
          ...defaultSet.params,
          drawCenterlines: true,
        },
      },
      {
        caseName: "default",
      }
    );

    expect(document.layers[0]?.paths).toHaveLength(defaultSet.params.strokeCount - 1);
  });
});
