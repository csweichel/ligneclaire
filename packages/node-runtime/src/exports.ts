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
  GcodeOversizeHandling,
  GcodeRotationDeg,
  PlotterPenMotionConfig,
} from "./api-types";
import { ensureDirectory, resolveExportPath, workspaceRoot, workspaceRelative } from "./paths";
import { applyHeightMeshCompensation, parseHeightMeshFile } from "./height-mesh";
import { loadPlotterConfig, type PlotterConfig } from "./plotters";
import { resolvePlotterPenMotion } from "./pen-motion";
import { runProcess } from "./process";
import { getProgramDetails } from "./registry";
import { renderProgram } from "./render";
import { getToolDiagnostics } from "./tools";

const svgOptimizationPipeline = ["linemerge", "linesimplify", "reloop", "linesort"] as const;
const gcodeOptimizationPipeline = ["linemerge", "reloop", "linesort", "--two-opt"] as const;
const gcodeReadSimplifyArgs = ["--quantization", "0.1mm", "--simplify"] as const;

type PageSize = Readonly<{
  widthMm: number;
  heightMm: number;
}>;

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

function formatLengthMm(value: number): string {
  return `${value}mm`;
}

function formatPageSize(size: PageSize): string {
  return `${formatLengthMm(size.widthMm)}x${formatLengthMm(size.heightMm)}`;
}

function rotatePageSize(
  page: PageSize,
  rotationDeg: GcodeRotationDeg | undefined
): PageSize {
  switch (rotationDeg ?? 0) {
    case 90:
    case 270:
      return {
        widthMm: page.heightMm,
        heightMm: page.widthMm,
      };
    case 0:
    case 180:
      return page;
  }
}

export function buildOversizeHandlingCommands(
  oversizeHandling: GcodeOversizeHandling | undefined,
  canvas: PageSize,
  plotterPage: PageSize,
  rotationDeg: GcodeRotationDeg | undefined
): string[] {
  const mode = oversizeHandling ?? "ignore";
  if (mode === "ignore") {
    return [];
  }

  const rotatedCanvas = rotatePageSize(canvas, rotationDeg);
  const exceedsPlotterPage =
    rotatedCanvas.widthMm > plotterPage.widthMm ||
    rotatedCanvas.heightMm > plotterPage.heightMm;

  if (!exceedsPlotterPage) {
    return [];
  }

  if (mode === "clip") {
    return [
      "crop",
      "0mm",
      "0mm",
      formatLengthMm(plotterPage.widthMm),
      formatLengthMm(plotterPage.heightMm),
    ];
  }

  return [
    "layout",
    "--no-bbox",
    "--fit-to-margins",
    "0mm",
    "--align",
    "left",
    "--valign",
    "top",
    formatPageSize(plotterPage),
  ];
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

function joinGcodeBlocks(blocks: readonly string[]): string {
  return `${blocks.map((block) => block.trim()).filter((block) => block.length > 0).join("\n")}\n`;
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

export function createGwriteProfile(
  config: PlotterConfig,
  penMotionOverride?: PlotterPenMotionConfig
): string {
  const unitCommand = config.gcode.unit === "mm" ? "G21" : "G20";
  const travelCommand = config.gcode.travelCommand ?? "G0";
  const travelFeedRateMmPerMin =
    config.gcode.travelFeedRateMmPerMin ?? config.gcode.feedRateMmPerMin;
  const penMotion = resolvePlotterPenMotion(config.gcode, penMotionOverride);
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
  const documentStart = joinGcodeBlocks([
    unitCommand,
    "G17",
    "G90",
    config.gcode.preambleCommand ?? "",
  ]);
  const segmentFirst = joinGcodeBlocks([
    travelMove.trimEnd(),
    penMotion.penDownCommand,
    `G1 F${config.gcode.feedRateMmPerMin}`,
  ]);
  const documentEnd = joinGcodeBlocks([
    ...(config.gcode.penUpAtDocumentEnd === false ? [] : [penMotion.penUpCommand]),
    ...(config.gcode.returnHomeAtDocumentEnd === false ? [] : [returnHomeMove.trimEnd()]),
    "M2",
  ]);

  return [
    "[gwrite]",
    `default_profile = "${config.id}"`,
    "",
    `[gwrite.${config.id}]`,
    `unit = "${config.gcode.unit}"`,
    `document_start = """${escapeToml(documentStart)}"""`,
    'line_start = ""',
    `segment_first = """${escapeToml(segmentFirst)}"""`,
    `segment = """${escapeToml(`G1 X{x:.4f} Y{y:.4f} F${config.gcode.feedRateMmPerMin}\n`) }"""`,
    `line_end = """${escapeToml(`${penMotion.penUpCommand}\n`) }"""`,
    `document_end = """${escapeToml(documentEnd)}"""`,
    `vertical_flip = ${config.gcode.verticalFlip ? "true" : "false"}`,
    "",
  ].join("\n");
}

function applyRequestedHeightMesh(
  gcode: string,
  request: Pick<DownloadGcodeRequest | ExportGcodeRequest, "heightMesh" | "penMotion">,
  device: PlotterConfig
): string {
  if (!request.heightMesh) {
    return gcode;
  }

  const mesh = parseHeightMeshFile(request.heightMesh);
  if (!mesh) {
    throw new RuntimeError("INVALID_HEIGHT_MESH", "Height mesh JSON is invalid.", {
      status: 400,
    });
  }

  if (mesh.plotter.id !== device.id) {
    throw new RuntimeError(
      "HEIGHT_MESH_DEVICE_MISMATCH",
      `Height mesh was captured for "${mesh.plotter.id}" but "${device.id}" is selected for export.`,
      {
        status: 400,
      }
    );
  }

  if (!device.gcode.heightMeshCompensation || device.gcode.heightMeshCompensation.enabled === false) {
    throw new RuntimeError(
      "HEIGHT_MESH_UNSUPPORTED",
      `Plotter "${device.id}" does not support height-mesh compensated export.`,
      {
        status: 400,
      }
    );
  }

  return applyHeightMeshCompensation(gcode, mesh, device, request.penMotion);
}

async function runVpypePipeline(inputSvgPath: string, extraArgs: readonly string[]): Promise<void> {
  const args = ["read", inputSvgPath, ...svgOptimizationPipeline, ...extraArgs];
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

export function createGcodeExportArgs(
  request: Pick<
    ExportGcodeRequest | DownloadGcodeRequest,
    "deviceId" | "oversizeHandling" | "programId" | "rotationDeg"
  >,
  configPath: string,
  inputSvgPath: string,
  outputPath: string,
  device: PlotterConfig
): string[] {
  const optimizePaths = device.gcode.optimizePaths !== false;
  // vpype flattens curves during `read`, so G-code exports simplify them at import time
  // instead of applying a second generic segment simplification later in the pipeline.
  const readArgs = optimizePaths
    ? ["read", ...gcodeReadSimplifyArgs, inputSvgPath]
    : ["read", inputSvgPath];
  const pipeline = optimizePaths ? [...gcodeOptimizationPipeline] : [];
  const pageRotationCommands = buildPageRotationCommands(request.rotationDeg);
  const pageOversizeCommands = buildOversizeHandlingCommands(
    request.oversizeHandling,
    getProgramDetails(request.programId).canvas,
    device.page,
    request.rotationDeg
  );

  return [
    "--config",
    configPath,
    ...readArgs,
    ...pageRotationCommands,
    ...pageOversizeCommands,
    ...pipeline,
    "gwrite",
    "--profile",
    device.id,
    outputPath,
  ];
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
    await writeFile(configPath, createGwriteProfile(device, request.penMotion), "utf8");
    const args = createGcodeExportArgs(
      request,
      configPath,
      inputSvgPath,
      targetPath,
      device
    );
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

    const compensatedContent = applyRequestedHeightMesh(
      await readFile(targetPath, "utf8"),
      request,
      device
    );
    await writeFile(targetPath, compensatedContent, "utf8");
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
    await writeFile(configPath, createGwriteProfile(device, request.penMotion), "utf8");
    const args = createGcodeExportArgs(
      request,
      configPath,
      inputSvgPath,
      outputGcodePath,
      device
    );
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

    const compensatedContent = applyRequestedHeightMesh(
      await readFile(outputGcodePath, "utf8"),
      request,
      device
    );

    return {
      fileName,
      contentType: "text/plain; charset=utf-8",
      content: compensatedContent,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}
