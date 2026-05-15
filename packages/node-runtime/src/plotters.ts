import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { RuntimeError } from "./errors";
import { resolvePlotterConfigPath, workspaceRoot } from "./paths";
import type { PlotterDeviceSummary, PlotterGcodeConfig } from "./api-types";
import {
  normalizePlotterPenMotion,
  type PlotterGcodeConfigWithLegacyPenCommands,
} from "./pen-motion";

export type PlotterConfig = PlotterDeviceSummary &
  Readonly<{
    gcode: PlotterGcodeConfig;
  }>;

const plotterConfigDirectory = path.join(workspaceRoot, "config", "plotters");

type RawPlotterConfig = Omit<PlotterConfig, "gcode"> &
  Readonly<{
    gcode: PlotterGcodeConfigWithLegacyPenCommands;
  }>;

function normalizePlotterConfig(config: RawPlotterConfig): PlotterConfig {
  const nextGcode = Object.fromEntries(
    Object.entries({
      ...config.gcode,
      penMotion: normalizePlotterPenMotion(config.gcode),
    }).filter(([key]) => key !== "penUpCommand" && key !== "penDownCommand")
  );

  return {
    ...config,
    gcode: nextGcode as PlotterGcodeConfig,
  };
}

async function readPlotterConfig(filePath: string): Promise<PlotterConfig> {
  try {
    return normalizePlotterConfig(
      JSON.parse(await readFile(filePath, "utf8")) as RawPlotterConfig
    );
  } catch (error) {
    if (error instanceof RuntimeError) {
      throw error;
    }

    throw new RuntimeError("INVALID_PLOTTER_CONFIG", `Failed to read plotter config ${filePath}.`, {
      status: 500,
      cause: error,
    });
  }
}

export async function loadPlotterConfig(deviceId: string): Promise<PlotterConfig> {
  return await readPlotterConfig(resolvePlotterConfigPath(deviceId));
}

export async function listPlotters(): Promise<readonly PlotterDeviceSummary[]> {
  const entries = await readdir(plotterConfigDirectory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name));

  return await Promise.all(
    files.map(async (entry) => {
      const config = await readPlotterConfig(path.join(plotterConfigDirectory, entry.name));
      return {
        id: config.id,
        label: config.label,
        page: config.page,
        gcode: {
          unit: config.gcode.unit,
          feedRateMmPerMin: config.gcode.feedRateMmPerMin,
          travelCommand: config.gcode.travelCommand,
          travelFeedRateMmPerMin: config.gcode.travelFeedRateMmPerMin,
          preambleCommand: config.gcode.preambleCommand,
          heightMeshSampler: config.gcode.heightMeshSampler,
          heightMeshCompensation: config.gcode.heightMeshCompensation,
          penMotion: config.gcode.penMotion,
        },
        transport: config.transport,
      };
    })
  );
}
