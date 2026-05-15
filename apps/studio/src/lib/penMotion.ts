import type {
  PlotterDeviceSummary,
  PlotterGcodeSummary,
  PlotterPenMotionCommands,
  PlotterPenMotionConfig,
} from "@ligneclaire/node-runtime";

export type ResolvedPenMotionCommands = Readonly<{
  penUpCommand: string;
  penDownCommand: string;
}>;

const emptyCommandPenMotion: PlotterPenMotionCommands = {
  mode: "commands",
  penUpCommand: "",
  penDownCommand: "",
};

function formatGcodeNumber(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString();
}

function toGcodeUnits(valueMm: number, unit: PlotterGcodeSummary["unit"]): number {
  return unit === "mm" ? valueMm : valueMm / 25.4;
}

function createAbsoluteZMove(
  command: "G0" | "G1",
  zMm: number,
  unit: PlotterGcodeSummary["unit"],
  feedRateMmPerMin?: number
): string {
  const parts = [command, `Z${formatGcodeNumber(toGcodeUnits(zMm, unit))}`];

  if (command === "G1" && typeof feedRateMmPerMin === "number") {
    parts.push(`F${formatGcodeNumber(feedRateMmPerMin)}`);
  }

  return parts.join(" ");
}

function plotterGcodeSummary(
  plotter: Pick<PlotterDeviceSummary, "gcode"> | null | undefined
): PlotterGcodeSummary | null {
  return plotter?.gcode ?? null;
}

export function defaultPlotterPenMotion(
  plotter: Pick<PlotterDeviceSummary, "gcode"> | null | undefined
): PlotterPenMotionConfig {
  return plotterGcodeSummary(plotter)?.penMotion ?? emptyCommandPenMotion;
}

export function formatPenMotionModeLabel(
  penMotion: PlotterPenMotionConfig
): string {
  return penMotion.mode === "commands" ? "Commands" : "Z depth";
}

export function resolvePenMotionCommands(
  plotter: Pick<PlotterDeviceSummary, "gcode"> | null | undefined,
  penMotion: PlotterPenMotionConfig
): ResolvedPenMotionCommands {
  if (penMotion.mode === "commands") {
    return {
      penUpCommand: penMotion.penUpCommand,
      penDownCommand: penMotion.penDownCommand,
    };
  }

  const gcode = plotterGcodeSummary(plotter);
  const command = gcode?.travelCommand ?? "G0";
  const travelFeedRateMmPerMin =
    gcode?.travelFeedRateMmPerMin ?? gcode?.feedRateMmPerMin;
  const unit = gcode?.unit ?? "mm";

  return {
    penUpCommand: createAbsoluteZMove(
      command,
      penMotion.penUpZMm,
      unit,
      travelFeedRateMmPerMin
    ),
    penDownCommand: createAbsoluteZMove(
      command,
      penMotion.penDownZMm,
      unit,
      travelFeedRateMmPerMin
    ),
  };
}
