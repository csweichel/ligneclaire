import { describe, expect, it } from "vitest";
import { applyHeightMeshCompensation, createHeightMeshFile } from "./height-mesh";
import type { PlotterConfig } from "./plotters";
import {
  buildOversizeHandlingCommands,
  buildPageRotationCommands,
  createGcodeExportArgs,
  createGwriteProfile,
} from "./exports";

describe("createGwriteProfile", () => {
  it("keeps legacy plotters on G0 travel moves by default", () => {
    const config: PlotterConfig = {
      id: "legacy-plotter",
      label: "Legacy Plotter",
      page: {
        widthMm: 297,
        heightMm: 210,
      },
      gcode: {
        unit: "mm",
        feedRateMmPerMin: 2400,
        penMotion: {
          mode: "commands",
          penUpCommand: "M5",
          penDownCommand: "M3 S30",
        },
        verticalFlip: true,
      },
    };

    const profile = createGwriteProfile(config);

    expect(profile).toContain('document_start = """G21\nG17\nG90\n"""');
    expect(profile).toContain('segment_first = """G0 X{x:.4f} Y{y:.4f}');
    expect(profile).toContain('document_end = """M5\nG0 X0.0000 Y0.0000\nM2');
  });

  it("supports controlled G1 travel moves and multi-line pen commands", () => {
    const config: PlotterConfig = {
      id: "vigotec-vg-x4",
      label: "VigoTec VG-X4 / VG-A4",
      page: {
        widthMm: 297,
        heightMm: 210,
      },
      gcode: {
        unit: "mm",
        feedRateMmPerMin: 1200,
        travelCommand: "G1",
        travelFeedRateMmPerMin: 1200,
        penMotion: {
          mode: "commands",
          penUpCommand: "M5\nG4 P1",
          penDownCommand: "M3 S400\nG4 P1",
        },
        verticalFlip: true,
      },
    };

    const profile = createGwriteProfile(config);

    expect(profile).toContain('document_start = """G21\nG17\nG90\n"""');
    expect(profile).toContain('segment_first = """G1 X{x:.4f} Y{y:.4f} F1200');
    expect(profile).toContain('M3 S400\nG4 P1\nG1 F1200');
    expect(profile).toContain('document_end = """M5\nG4 P1\nG1 X0.0000 Y0.0000 F1200\nM2');
  });

  it("includes an optional preamble block after standard machine setup", () => {
    const config: PlotterConfig = {
      id: "preamble-plotter",
      label: "Preamble Plotter",
      page: {
        widthMm: 297,
        heightMm: 210,
      },
      gcode: {
        unit: "mm",
        feedRateMmPerMin: 2400,
        preambleCommand: "G54\nG92 X0 Y0",
        penMotion: {
          mode: "commands",
          penUpCommand: "M5",
          penDownCommand: "M3 S30",
        },
        verticalFlip: true,
      },
    };

    const profile = createGwriteProfile(config);

    expect(profile).toContain('document_start = """G21\nG17\nG90\nG54\nG92 X0 Y0\n"""');
  });

  it("keeps sampler defaults out of normal drawing exports", () => {
    const config: PlotterConfig = {
      id: "probe-plotter",
      label: "Probe Plotter",
      page: {
        widthMm: 297,
        heightMm: 210,
      },
      gcode: {
        unit: "mm",
        feedRateMmPerMin: 1200,
        preambleCommand: "G54",
        heightMeshSampler: {
          columns: 2,
          rows: 1,
          moveFeedRateMmPerMin: 1000,
          probeFeedRateMmPerMin: 400,
          releaseFeedRateMmPerMin: 100,
          probeDepthMm: -25,
          releaseDistanceMm: 10,
          clearanceMm: 1,
        },
        penMotion: {
          mode: "commands",
          penUpCommand: "M5",
          penDownCommand: "M3 S30",
        },
        verticalFlip: true,
      },
    };

    const profile = createGwriteProfile(config);

    expect(profile).toContain('document_start = """G21\nG17\nG90\nG54');
    expect(profile).not.toContain("; Height mesh sampler");
    expect(profile).not.toContain("G38.2");
  });

  it("supports a minimal raw XY/Z target without a final home move", () => {
    const config: PlotterConfig = {
      id: "vanilla",
      label: "Vanilla G-code (raw XY/Z)",
      page: {
        widthMm: 297,
        heightMm: 210,
      },
      gcode: {
        unit: "mm",
        feedRateMmPerMin: 1200,
        travelCommand: "G0",
        travelFeedRateMmPerMin: 1200,
        penMotion: {
          mode: "commands",
          penUpCommand: "G91\nG0 Z-15\nG90",
          penDownCommand: "G91\nG0 Z15\nG90",
        },
        verticalFlip: false,
        optimizePaths: false,
        penUpAtDocumentEnd: true,
        returnHomeAtDocumentEnd: false,
      },
    };

    const profile = createGwriteProfile(config);

    expect(profile).toContain('document_start = """G21\nG17\nG90\n"""');
    expect(profile).toContain('segment_first = """G0 X{x:.4f} Y{y:.4f}\nG91\nG0 Z15\nG90\nG1 F1200');
    expect(profile).toContain('line_end = """G91\nG0 Z-15\nG90');
    expect(profile).toContain('document_end = """G91\nG0 Z-15\nG90\nM2\n"""');
  });

  it("can synthesize Z-axis pen moves from a configured depth mode", () => {
    const config: PlotterConfig = {
      id: "vanilla",
      label: "Vanilla G-code (raw XY/Z)",
      page: {
        widthMm: 297,
        heightMm: 210,
      },
      gcode: {
        unit: "mm",
        feedRateMmPerMin: 1200,
        travelCommand: "G0",
        travelFeedRateMmPerMin: 1200,
        penMotion: {
          mode: "z-depth",
          penUpZMm: 12.5,
          penDownZMm: -1.25,
        },
        verticalFlip: false,
        optimizePaths: false,
        penUpAtDocumentEnd: true,
        returnHomeAtDocumentEnd: false,
      },
    };

    const profile = createGwriteProfile(config);

    expect(profile).toContain('segment_first = """G0 X{x:.4f} Y{y:.4f}\nG0 Z-1.25\nG1 F1200');
    expect(profile).toContain('line_end = """G0 Z12.5\n"""');
    expect(profile).toContain('document_end = """G0 Z12.5\nM2\n"""');
  });
});

describe("applyHeightMeshCompensation", () => {
  const plotter: PlotterConfig = {
    id: "vanilla",
    label: "Vanilla G-code (raw XY/Z)",
    page: {
      widthMm: 100,
      heightMm: 100,
    },
    gcode: {
      unit: "mm",
      feedRateMmPerMin: 1200,
      penMotion: {
        mode: "commands",
        penUpCommand: "G91\nG0 Z50\nG90",
        penDownCommand: "G91\nG0 Z-50\nG90",
      },
      heightMeshCompensation: {
        enabled: true,
        interpolation: "nearest",
        referenceMode: "max",
      },
      verticalFlip: false,
    },
  };

  function createMesh(zValues: readonly [number, number]) {
    return createHeightMeshFile(
      plotter.page,
      {
        columns: 2,
        rows: 1,
        originXMm: 0,
        originYMm: 50,
        widthMm: 100,
        heightMm: 0,
        moveFeedRateMmPerMin: 1000,
        probeFeedRateMmPerMin: 400,
        releaseFeedRateMmPerMin: 100,
        probeDepthMm: -25,
        releaseDistanceMm: 10,
      },
      [
        {
          xMm: 0,
          yMm: 50,
          zMm: zValues[0],
          probeTriggered: true,
          rawLine: `[PRB:0,50,${zValues[0]}:1]`,
        },
        {
          xMm: 100,
          yMm: 50,
          zMm: zValues[1],
          probeTriggered: true,
          rawLine: `[PRB:100,50,${zValues[1]}:1]`,
        },
      ],
      {
        plotterId: plotter.id,
        plotterLabel: plotter.label,
      }
    );
  }

  it("injects XY-following Z moves while the pen is down", () => {
    const compensated = applyHeightMeshCompensation(
      [
        "G21",
        "G90",
        "G0 X0 Y50",
        "G91",
        "G0 Z-50",
        "G90",
        "G1 F1200",
        "G1 X100 Y50 F1200",
        "G91",
        "G0 Z50",
        "G90",
        "M2",
      ].join("\n"),
      createMesh([0, -2]),
      plotter
    );

    expect(compensated).toContain("G1 X100 Y50 F1200 Z-52");
    expect(compensated).toContain("G1 Z-50 F1200\nG91\nG0 Z50\nG90");
  });

  it("offsets the start point immediately after the pen drops", () => {
    const compensated = applyHeightMeshCompensation(
      [
        "G21",
        "G90",
        "G0 X0 Y50",
        "G91",
        "G0 Z-50",
        "G90",
        "G1 F1200",
        "G1 X100 Y50 F1200",
        "G91",
        "G0 Z50",
        "G90",
        "M2",
      ].join("\n"),
      createMesh([-1, 0]),
      plotter
    );

    expect(compensated).toContain("G91\nG0 Z-50\nG90\nG1 Z-51 F1200\nG1 F1200");
  });

  it("adds mesh offsets on top of the configured Z-depth drawing height", () => {
    const compensated = applyHeightMeshCompensation(
      [
        "G21",
        "G90",
        "G0 X0 Y50",
        "G0 Z-1",
        "G1 F1200",
        "G1 X100 Y50 F1200",
        "G0 Z5",
        "M2",
      ].join("\n"),
      createMesh([0, -2]),
      plotter,
      {
        mode: "z-depth",
        penUpZMm: 5,
        penDownZMm: -1,
      }
    );

    expect(compensated).toContain("G1 X100 Y50 F1200 Z-3");
    expect(compensated).toContain("G1 Z-1 F1200\nG0 Z5");
  });
});

describe("buildPageRotationCommands", () => {
  it("skips rotation when no override is requested", () => {
    expect(buildPageRotationCommands(undefined)).toEqual([]);
    expect(buildPageRotationCommands(0)).toEqual([]);
  });

  it("maps clockwise quarter turns to pagerotate commands", () => {
    expect(buildPageRotationCommands(90)).toEqual(["pagerotate", "--clockwise"]);
    expect(buildPageRotationCommands(180)).toEqual([
      "pagerotate",
      "--clockwise",
      "pagerotate",
      "--clockwise",
    ]);
    expect(buildPageRotationCommands(270)).toEqual(["pagerotate"]);
  });
});

describe("buildOversizeHandlingCommands", () => {
  const canvas = {
    widthMm: 420,
    heightMm: 297,
  } as const;
  const plotterPage = {
    widthMm: 297,
    heightMm: 210,
  } as const;

  it("does nothing when oversize handling is ignored", () => {
    expect(buildOversizeHandlingCommands("ignore", canvas, plotterPage, 0)).toEqual([]);
  });

  it("skips scaling when the rotated canvas already fits", () => {
    expect(
      buildOversizeHandlingCommands(
        "scale",
        {
          widthMm: 210,
          heightMm: 297,
        },
        {
          widthMm: 297,
          heightMm: 210,
        },
        90
      )
    ).toEqual([]);
  });

  it("builds a top-left aligned fit-to-page layout pipeline for scale mode", () => {
    expect(buildOversizeHandlingCommands("scale", canvas, plotterPage, 0)).toEqual([
      "layout",
      "--no-bbox",
      "--fit-to-margins",
      "0mm",
      "--align",
      "left",
      "--valign",
      "top",
      "297mmx210mm",
    ]);
  });

  it("builds a page crop for clip mode", () => {
    expect(buildOversizeHandlingCommands("clip", canvas, plotterPage, 0)).toEqual([
      "crop",
      "0mm",
      "0mm",
      "297mm",
      "210mm",
    ]);
  });
});

describe("createGcodeExportArgs", () => {
  it("simplifies curved SVG geometry during import and uses stronger path ordering for gcode", () => {
    const config: PlotterConfig = {
      id: "axidraw-a4",
      label: "AxiDraw A4",
      page: {
        widthMm: 297,
        heightMm: 210,
      },
      gcode: {
        unit: "mm",
        feedRateMmPerMin: 2400,
        penMotion: {
          mode: "commands",
          penUpCommand: "M5",
          penDownCommand: "M3 S30",
        },
        verticalFlip: true,
      },
    };

    const args = createGcodeExportArgs(
      {
        deviceId: config.id,
        oversizeHandling: "ignore",
        programId: "waves",
        rotationDeg: 0,
      },
      "/tmp/config.toml",
      "/tmp/input.svg",
      "/tmp/output.gcode",
      config
    );

    expect(args).toEqual([
      "--config",
      "/tmp/config.toml",
      "read",
      "--quantization",
      "0.1mm",
      "--simplify",
      "/tmp/input.svg",
      "linemerge",
      "reloop",
      "linesort",
      "--two-opt",
      "gwrite",
      "--profile",
      "axidraw-a4",
      "/tmp/output.gcode",
    ]);
  });

  it("can skip vpype path optimization for raw targets", () => {
    const config: PlotterConfig = {
      id: "vanilla",
      label: "Vanilla G-code (raw XY/Z)",
      page: {
        widthMm: 297,
        heightMm: 210,
      },
      gcode: {
        unit: "mm",
        feedRateMmPerMin: 1200,
        penMotion: {
          mode: "commands",
          penUpCommand: "G91\nG0 Z-15\nG90",
          penDownCommand: "G91\nG0 Z15\nG90",
        },
        verticalFlip: false,
        optimizePaths: false,
        penUpAtDocumentEnd: true,
      },
    };

    const args = createGcodeExportArgs(
      {
        deviceId: config.id,
        oversizeHandling: "ignore",
        programId: "waves",
        rotationDeg: 0,
      },
      "/tmp/config.toml",
      "/tmp/input.svg",
      "/tmp/output.gcode",
      config
    );

    expect(args).toEqual([
      "--config",
      "/tmp/config.toml",
      "read",
      "/tmp/input.svg",
      "gwrite",
      "--profile",
      "vanilla",
      "/tmp/output.gcode",
    ]);
  });
});
