import { RuntimeError } from "./errors";
import type {
  PlotterGcodeConfig,
  PlotterPenMotionCommands,
  PlotterPenMotionConfig,
} from "./api-types";

export type PlotterGcodeConfigWithLegacyPenCommands = Omit<PlotterGcodeConfig, "penMotion"> &
  Readonly<{
    penMotion?: PlotterPenMotionConfig;
    penUpCommand?: string;
    penDownCommand?: string;
  }>;

export type ResolvedPlotterPenMotion = Readonly<{
  mode: PlotterPenMotionConfig["mode"];
  penUpCommand: string;
  penDownCommand: string;
  penUpZMm?: number;
  penDownZMm?: number;
}>;

function formatGcodeNumber(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString();
}

function toGcodeUnits(valueMm: number, unit: PlotterGcodeConfig["unit"]): number {
  return unit === "mm" ? valueMm : valueMm / 25.4;
}

function createAbsoluteZMove(
  command: "G0" | "G1",
  zMm: number,
  unit: PlotterGcodeConfig["unit"],
  feedRateMmPerMin?: number
): string {
  const parts = [command, `Z${formatGcodeNumber(toGcodeUnits(zMm, unit))}`];

  if (command === "G1" && typeof feedRateMmPerMin === "number") {
    parts.push(`F${formatGcodeNumber(feedRateMmPerMin)}`);
  }

  return parts.join(" ");
}

export function normalizePlotterPenMotion(
  gcode: PlotterGcodeConfigWithLegacyPenCommands
): PlotterPenMotionConfig {
  if (gcode.penMotion) {
    return gcode.penMotion;
  }

  if (typeof gcode.penUpCommand === "string" && typeof gcode.penDownCommand === "string") {
    return {
      mode: "commands",
      penUpCommand: gcode.penUpCommand,
      penDownCommand: gcode.penDownCommand,
    } satisfies PlotterPenMotionCommands;
  }

  throw new RuntimeError(
    "INVALID_PLOTTER_CONFIG",
    "Plotter G-code config must define either penMotion or legacy penUpCommand/penDownCommand.",
    {
      status: 500,
    }
  );
}

export function resolvePlotterPenMotion(
  gcode: Pick<
    PlotterGcodeConfig,
    "feedRateMmPerMin" | "penMotion" | "travelCommand" | "travelFeedRateMmPerMin" | "unit"
  >,
  override?: PlotterPenMotionConfig
): ResolvedPlotterPenMotion {
  const penMotion = override ?? gcode.penMotion;

  if (penMotion.mode === "commands") {
    return {
      mode: penMotion.mode,
      penUpCommand: penMotion.penUpCommand,
      penDownCommand: penMotion.penDownCommand,
    };
  }

  const command = gcode.travelCommand ?? "G0";
  const travelFeedRateMmPerMin =
    gcode.travelFeedRateMmPerMin ?? gcode.feedRateMmPerMin;

  return {
    mode: penMotion.mode,
    penUpCommand: createAbsoluteZMove(
      command,
      penMotion.penUpZMm,
      gcode.unit,
      travelFeedRateMmPerMin
    ),
    penDownCommand: createAbsoluteZMove(
      command,
      penMotion.penDownZMm,
      gcode.unit,
      travelFeedRateMmPerMin
    ),
    penUpZMm: penMotion.penUpZMm,
    penDownZMm: penMotion.penDownZMm,
  };
}
