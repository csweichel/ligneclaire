import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RuntimeError } from "./errors";
import type {
  DownloadArtifact,
  DownloadGcodeRequest,
  DownloadSvgRequest,
  ExportGcodeRequest,
  ExportResponse,
  ExportSvgRequest,
  GcodeRotationDeg,
} from "./api-types";
import { ensureDirectory, resolveExportPath, workspaceRoot, workspaceRelative } from "./paths";
import { loadPlotterConfig, type PlotterConfig } from "./plotters";
import { runProcess } from "./process";
import { renderProgram } from "./render";
import { getToolDiagnostics } from "./tools";

const optimizationPipeline = ["linemerge", "linesimplify", "reloop", "linesort"] as const;

export function buildPageRotationCommands(rotationDeg: GcodeRotationDeg | undefined): string[] {
  switch (rotationDeg ?? 0) {
    case 0:
      return [];
    case 90:
      return ["pagerotate", "--clockwise"];
    case 180:
      return ["pagerotate", "--clockwise", "pagerotate", "--clockwise"];
    case 270:
      return ["pagerotate"];
  }
}

function createMoveCommand(
  command: "G0" | "G1",
  x: string,
  y: string,
  feedRateMmPerMin?: number
): string {
  const parts = [command, `X${x}`, `Y${y}`];

  if (command === "G1" && typeof feedRateMmPerMin === "number") {
    parts.push(`F${feedRateMmPerMin}`);
  }

  return parts.join(" ");
}

async function ensureVpypeAvailable(requireGcode: boolean): Promise<void> {
  const diagnostics = await getToolDiagnostics();
  if (!diagnostics.vpype.available) {
    throw new RuntimeError("VPYPE_UNAVAILABLE", diagnostics.vpype.error ?? "vpype is unavailable.", {
      status: 503,
    });
  }

  if (requireGcode && !diagnostics.vpypeGcode.available) {
    throw new RuntimeError(
      "VPYPE_GCODE_UNAVAILABLE",
      diagnostics.vpypeGcode.error ?? "vpype-gcode is unavailable.",
      {
        status: 503,
      }
    );
  }
}

async function makeTempWorkingDir(prefix: string): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), `ligneclaire-${prefix}-`));
}

export function createGwriteProfile(config: PlotterConfig): string {
  const unitCommand = config.gcode.unit === "mm" ? "G21" : "G20";
  const travelCommand = config.gcode.travelCommand ?? "G0";
  const travelFeedRateMmPerMin =
    config.gcode.travelFeedRateMmPerMin ?? config.gcode.feedRateMmPerMin;
  const travelMove = `${createMoveCommand(
    travelCommand,
    "{x:.4f}",
    "{y:.4f}",
    travelFeedRateMmPerMin
  )}\n`;
  const returnHomeMove = `${createMoveCommand(
    travelCommand,
    "0.0000",
    "0.0000",
    travelFeedRateMmPerMin
  )}\n`;
  const escapeToml = (value: string): string => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

  return [
    "[gwrite]",
    `default_profile = "${config.id}"`,
    "",
    `[gwrite.${config.id}]`,
    `unit = "${config.gcode.unit}"`,
    `document_start = """${escapeToml(`${unitCommand}\nG17\nG90\n${config.gcode.penUpCommand}\n`) }"""`,
    'line_start = ""',
    `segment_first = """${escapeToml(`${travelMove}${config.gcode.penDownCommand}\nG1 F${config.gcode.feedRateMmPerMin}\n`) }"""`,
    `segment = """${escapeToml(`G1 X{x:.4f} Y{y:.4f} F${config.gcode.feedRateMmPerMin}\n`) }"""`,
    `line_end = """${escapeToml(`${config.gcode.penUpCommand}\n`) }"""`,
    `document_end = """${escapeToml(`${config.gcode.penUpCommand}\n${returnHomeMove}M2\n`) }"""`,
    `vertical_flip = ${config.gcode.verticalFlip ? "true" : "false"}`,
    "",
  ].join("\n");
}

async function runVpypePipeline(inputSvgPath: string, extraArgs: readonly string[]): Promise<void> {
  const args = ["read", inputSvgPath, ...optimizationPipeline, ...extraArgs];
  const result = await runProcess("vpype", args, { cwd: workspaceRoot });
  if (result.code !== 0) {
    throw new RuntimeError("VPYPE_FAILED", result.stderr || result.stdout || "vpype export failed.", {
      status: 500,
      details: {
        args,
      },
    });
  }
}

function createDownloadBaseName(programId: string, paramSetId?: string): string {
  return `${programId}-${paramSetId ?? "export"}`;
}

function normalizeDownloadName(
  requestedName: string | undefined,
  fallbackName: string,
  extension: string
): string {
  const candidate = requestedName ? path.basename(requestedName) : fallbackName;
  const sanitized = candidate
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeName = sanitized.length > 0 ? sanitized : fallbackName;
  return safeName.toLowerCase().endsWith(extension) ? safeName : `${safeName}${extension}`;
}

export async function exportSvg(request: ExportSvgRequest): Promise<ExportResponse> {
  const targetPath = resolveExportPath(request.outPath);
  await ensureDirectory(path.dirname(targetPath));
  const renderResult = await renderProgram({
    ...request,
    mode: "export",
    showDebug: false,
  });

  if (!request.optimized) {
    await writeFile(targetPath, renderResult.svg, "utf8");
    return {
      outPath: workspaceRelative(targetPath),
      metrics: renderResult.metrics,
    };
  }

  await ensureVpypeAvailable(false);
  const tempDir = await makeTempWorkingDir("svg");

  try {
    const inputSvgPath = path.join(tempDir, "input.svg");
    await writeFile(inputSvgPath, renderResult.svg, "utf8");
    await runVpypePipeline(inputSvgPath, ["write", targetPath]);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }

  return {
    outPath: workspaceRelative(targetPath),
    metrics: renderResult.metrics,
  };
}

export async function exportGcode(request: ExportGcodeRequest): Promise<ExportResponse> {
  await ensureVpypeAvailable(true);
  const targetPath = resolveExportPath(request.outPath);
  await ensureDirectory(path.dirname(targetPath));
  const renderResult = await renderProgram({
    ...request,
    mode: "export",
    showDebug: false,
  });
  const tempDir = await makeTempWorkingDir("gcode");

  try {
    const inputSvgPath = path.join(tempDir, "input.svg");
    const configPath = path.join(tempDir, "vpype-gwrite.toml");
    const device = await loadPlotterConfig(request.deviceId);
    await writeFile(inputSvgPath, renderResult.svg, "utf8");
    await writeFile(configPath, createGwriteProfile(device), "utf8");
    const pageRotationCommands = buildPageRotationCommands(request.rotationDeg);

    const args = [
      "--config",
      configPath,
      "read",
      inputSvgPath,
      ...pageRotationCommands,
      ...optimizationPipeline,
      "gwrite",
      "--profile",
      device.id,
      targetPath,
    ];
    const result = await runProcess("vpype", args, { cwd: workspaceRoot });
    if (result.code !== 0) {
      throw new RuntimeError(
        "VPYPE_GCODE_FAILED",
        result.stderr || result.stdout || "vpype gcode export failed.",
        {
          status: 500,
          details: {
            args,
          },
        }
      );
    }
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }

  return {
    outPath: workspaceRelative(targetPath),
    metrics: renderResult.metrics,
  };
}

export async function exportSvgDownload(request: DownloadSvgRequest): Promise<DownloadArtifact> {
  const fallbackName = request.optimized
    ? `${createDownloadBaseName(request.programId, request.paramSetId)}.optimized.svg`
    : `${createDownloadBaseName(request.programId, request.paramSetId)}.svg`;
  const fileName = normalizeDownloadName(request.downloadName, fallbackName, ".svg");
  const renderResult = await renderProgram({
    ...request,
    mode: "export",
    showDebug: false,
  });

  if (!request.optimized) {
    return {
      fileName,
      contentType: "image/svg+xml; charset=utf-8",
      content: renderResult.svg,
    };
  }

  await ensureVpypeAvailable(false);
  const tempDir = await makeTempWorkingDir("svg-download");

  try {
    const inputSvgPath = path.join(tempDir, "input.svg");
    const outputSvgPath = path.join(tempDir, "output.svg");
    await writeFile(inputSvgPath, renderResult.svg, "utf8");
    await runVpypePipeline(inputSvgPath, ["write", outputSvgPath]);

    return {
      fileName,
      contentType: "image/svg+xml; charset=utf-8",
      content: await readFile(outputSvgPath, "utf8"),
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

export async function exportGcodeDownload(
  request: DownloadGcodeRequest
): Promise<DownloadArtifact> {
  await ensureVpypeAvailable(true);
  const renderResult = await renderProgram({
    ...request,
    mode: "export",
    showDebug: false,
  });
  const fileName = normalizeDownloadName(
    request.downloadName,
    `${createDownloadBaseName(request.programId, request.paramSetId)}.gcode`,
    ".gcode"
  );
  const tempDir = await makeTempWorkingDir("gcode-download");

  try {
    const inputSvgPath = path.join(tempDir, "input.svg");
    const outputGcodePath = path.join(tempDir, "output.gcode");
    const configPath = path.join(tempDir, "vpype-gwrite.toml");
    const device = await loadPlotterConfig(request.deviceId);
    await writeFile(inputSvgPath, renderResult.svg, "utf8");
    await writeFile(configPath, createGwriteProfile(device), "utf8");
    const pageRotationCommands = buildPageRotationCommands(request.rotationDeg);

    const args = [
      "--config",
      configPath,
      "read",
      inputSvgPath,
      ...pageRotationCommands,
      ...optimizationPipeline,
      "gwrite",
      "--profile",
      device.id,
      outputGcodePath,
    ];
    const result = await runProcess("vpype", args, { cwd: workspaceRoot });
    if (result.code !== 0) {
      throw new RuntimeError(
        "VPYPE_GCODE_FAILED",
        result.stderr || result.stdout || "vpype gcode export failed.",
        {
          status: 500,
          details: {
            args,
          },
        }
      );
    }

    return {
      fileName,
      contentType: "text/plain; charset=utf-8",
      content: await readFile(outputGcodePath, "utf8"),
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}
