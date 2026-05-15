import type {
  GcodeOversizeHandling,
  PlotterDeviceSummary,
  ProgramDetails,
} from "@ligneclaire/node-runtime";
import { formatExportRotationSummary } from "./gcodeOrientation";
import { formatPenMotionModeLabel } from "./penMotion";
import type { ExportSettings } from "../types";

export const exportOversizeOptions: readonly Readonly<{
  value: GcodeOversizeHandling;
  label: string;
  description: string;
}>[] = [
  {
    value: "ignore",
    label: "Ignore",
    description: "Keep the original coordinates even if they exceed the plotter page.",
  },
  {
    value: "scale",
    label: "Scale to fit",
    description: "Scale the canvas uniformly so it fits within the selected plotter page.",
  },
  {
    value: "clip",
    label: "Clip to page",
    description: "Keep the original scale and drop anything outside the selected plotter page.",
  },
] as const;

export function formatOversizeHandlingLabel(
  oversizeHandling: GcodeOversizeHandling
): string {
  switch (oversizeHandling) {
    case "ignore":
      return "Ignore";
    case "scale":
      return "Scale to fit";
    case "clip":
      return "Clip to page";
  }
}

export function findSelectedPlotter(
  plotters: readonly PlotterDeviceSummary[],
  deviceId: string
): PlotterDeviceSummary | null {
  return plotters.find((plotter) => plotter.id === deviceId) ?? null;
}

export function formatExportSettingsSummary(
  settings: ExportSettings,
  plotters: readonly PlotterDeviceSummary[],
  canvas: ProgramDetails["canvas"] | null | undefined
): string {
  const plotter = findSelectedPlotter(plotters, settings.deviceId);
  const plotterLabel = plotter?.label ?? "Select plotter";
  const orientationLabel = formatExportRotationSummary(
    settings.rotationDeg,
    canvas,
    plotter
  );

  return `${plotterLabel} · ${orientationLabel} · ${formatOversizeHandlingLabel(
    settings.oversizeHandling
  )} · ${formatPenMotionModeLabel(settings.penMotion)}`;
}
