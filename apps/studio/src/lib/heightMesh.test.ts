import { describe, expect, it } from "vitest";
import type { PlotterDeviceSummary } from "@ligneclaire/node-runtime";
import {
  buildHeightMeshSamplerConfig,
  clampHeightMeshSettings,
  coalesceHeightMeshProbeReadings,
  deriveDefaultHeightMeshSettings,
} from "./heightMesh";

function createPlotter(
  overrides: Partial<PlotterDeviceSummary> = {}
): PlotterDeviceSummary {
  return {
    id: "test-plotter",
    label: "Test plotter",
    page: {
      widthMm: 100,
      heightMm: 80,
    },
    gcode: {
      unit: "mm",
      feedRateMmPerMin: 1200,
      penMotion: {
        mode: "z-depth",
        penUpZMm: 5,
        penDownZMm: 0,
      },
      heightMeshSampler: {
        columns: 5,
        rows: 3,
        moveFeedRateMmPerMin: 1200,
        probeFeedRateMmPerMin: 100,
        releaseFeedRateMmPerMin: 200,
        probeDepthMm: -2,
        releaseDistanceMm: 1,
      },
    },
    ...overrides,
  };
}

describe("deriveDefaultHeightMeshSettings", () => {
  it("defaults to a 20mm inset sampling region", () => {
    const settings = deriveDefaultHeightMeshSettings(createPlotter());

    expect(settings).toEqual({
      marginMm: 20,
      widthMm: 100,
      heightMm: 80,
      sampleDistanceMm: 15,
    });
  });

  it("uses the configured sampler bounds before applying the margin", () => {
    const settings = deriveDefaultHeightMeshSettings(
      createPlotter({
        page: {
          widthMm: 200,
          heightMm: 120,
        },
        gcode: {
          unit: "mm",
          feedRateMmPerMin: 1200,
          penMotion: {
            mode: "z-depth",
            penUpZMm: 5,
            penDownZMm: 0,
          },
          heightMeshSampler: {
            columns: 5,
            rows: 3,
            originXMm: 10,
            originYMm: 5,
            widthMm: 120,
            heightMm: 90,
            moveFeedRateMmPerMin: 1200,
            probeFeedRateMmPerMin: 100,
            releaseFeedRateMmPerMin: 200,
            probeDepthMm: -2,
            releaseDistanceMm: 1,
          },
        },
      })
    );

    expect(settings.marginMm).toBe(20);
    expect(settings.widthMm).toBe(120);
    expect(settings.heightMm).toBe(90);
  });

  it("caps the default sampler region at 400 x 300mm", () => {
    const settings = deriveDefaultHeightMeshSettings(
      createPlotter({
        page: {
          widthMm: 500,
          heightMm: 500,
        },
      })
    );

    expect(settings.widthMm).toBe(400);
    expect(settings.heightMm).toBe(300);
  });
});

describe("height mesh sampler margin", () => {
  it("offsets the probe origin by the configured margin", () => {
    const config = buildHeightMeshSamplerConfig(createPlotter(), {
      marginMm: 12,
      widthMm: 70,
      heightMm: 50,
      sampleDistanceMm: 20,
    });

    expect(config?.originXMm).toBe(12);
    expect(config?.originYMm).toBe(12);
    expect(config?.widthMm).toBe(46);
    expect(config?.heightMm).toBe(26);
  });

  it("clamps the outer sampler region to stay inside the sampler bounds", () => {
    const settings = clampHeightMeshSettings(createPlotter(), {
      marginMm: 30,
      widthMm: 100,
      heightMm: 100,
      sampleDistanceMm: 10,
    });

    expect(settings.marginMm).toBe(30);
    expect(settings.widthMm).toBe(100);
    expect(settings.heightMm).toBe(80);
  });

  it("clamps large outer sampler regions to 400 x 300mm", () => {
    const settings = clampHeightMeshSettings(
      createPlotter({
        page: {
          widthMm: 500,
          heightMm: 500,
        },
      }),
      {
        marginMm: 0,
        widthMm: 500,
        heightMm: 500,
        sampleDistanceMm: 10,
      }
    );

    expect(settings.widthMm).toBe(400);
    expect(settings.heightMm).toBe(300);
  });

  it("limits large margins so at least a 1mm generated sample span remains", () => {
    const plotter = createPlotter({
      page: {
        widthMm: 30,
        heightMm: 30,
      },
    });
    const settings = clampHeightMeshSettings(
      plotter,
      {
        marginMm: 20,
        widthMm: 30,
        heightMm: 30,
        sampleDistanceMm: 10,
      }
    );
    const config = buildHeightMeshSamplerConfig(plotter, settings);

    expect(settings.marginMm).toBe(14.5);
    expect(settings.widthMm).toBe(30);
    expect(settings.heightMm).toBe(30);
    expect(config?.widthMm).toBe(1);
    expect(config?.heightMm).toBe(1);
  });

  it("keeps the generated probe span inside the configured outer region", () => {
    const config = buildHeightMeshSamplerConfig(
      createPlotter({
        page: {
          widthMm: 400,
          heightMm: 300,
        },
      }),
      {
        marginMm: 20,
        widthMm: 400,
        heightMm: 300,
        sampleDistanceMm: 10,
      }
    );

    expect(config?.originXMm).toBe(20);
    expect(config?.originYMm).toBe(20);
    expect(config?.widthMm).toBe(360);
    expect(config?.heightMm).toBe(260);
  });
});

describe("coalesceHeightMeshProbeReadings", () => {
  it("leaves single probe readings unchanged", () => {
    const readings = [
      { xMm: 0, yMm: 0, zMm: -1, probeTriggered: true, rawLine: "[PRB:0,0,-1:1]" },
      { xMm: 10, yMm: 0, zMm: -2, probeTriggered: true, rawLine: "[PRB:10,0,-2:1]" },
    ] as const;

    expect(coalesceHeightMeshProbeReadings(readings, 2)).toEqual(readings);
  });

  it("collapses doubled probe/release pairs to the lower Z reading", () => {
    expect(
      coalesceHeightMeshProbeReadings(
        [
          { xMm: 0, yMm: 0, zMm: -1.5, probeTriggered: true, rawLine: "[PRB:0,0,-1.5:1]" },
          { xMm: 0, yMm: 0, zMm: -1, probeTriggered: true, rawLine: "[PRB:0,0,-1:1]" },
          { xMm: 10, yMm: 0, zMm: -3, probeTriggered: true, rawLine: "[PRB:10,0,-3:1]" },
          { xMm: 10, yMm: 0, zMm: -2.25, probeTriggered: true, rawLine: "[PRB:10,0,-2.25:1]" },
        ],
        2
      )
    ).toEqual([
      { xMm: 0, yMm: 0, zMm: -1.5, probeTriggered: true, rawLine: "[PRB:0,0,-1.5:1]" },
      { xMm: 10, yMm: 0, zMm: -3, probeTriggered: true, rawLine: "[PRB:10,0,-3:1]" },
    ]);
  });
});
