import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { RuntimeError } from "./errors";
import { resolvePlotterConfigPath, workspaceRoot } from "./paths";
import type { PlotterDeviceSummary, PlotterGcodeConfig } from "./api-types";

export type PlotterConfig = PlotterDeviceSummary &
  Readonly<{
    gcode: PlotterGcodeConfig;
  }>;

const plotterConfigDirectory = path.join(workspaceRoot, "config", "plotters");

async function readPlotterConfig(filePath: string): Promise<PlotterConfig> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as PlotterConfig;
  } catch (error) {
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
      };
    })
  );
}
