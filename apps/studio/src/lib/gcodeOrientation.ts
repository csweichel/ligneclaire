import type { GcodeRotationDeg, PlotterDeviceSummary, ProgramDetails } from "@ligneclaire/node-runtime";
import type { ExportRotationSetting } from "../types";

type PageSize = Readonly<{
  widthMm: number;
  heightMm: number;
}>;

export type ResolvedGcodeRotationDeg = GcodeRotationDeg;

export const exportRotationOptions: readonly Readonly<{
  label: string;
  value: ExportRotationSetting;
}>[] = [
  { value: "auto", label: "Auto" },
  { value: 0, label: "As drawn" },
  { value: 90, label: "90 deg clockwise" },
  { value: 180, label: "180 deg" },
  { value: 270, label: "90 deg counter-clockwise" },
];

export function resolveGcodeRotationDeg(
  rotationDeg: ExportRotationSetting,
  canvas: PageSize | null | undefined,
  plotter: Pick<PlotterDeviceSummary, "page"> | null | undefined
): GcodeRotationDeg {
  if (rotationDeg !== "auto") {
    return rotationDeg;
  }

  if (
    canvas &&
    plotter &&
    canvas.widthMm === plotter.page.heightMm &&
    canvas.heightMm === plotter.page.widthMm
  ) {
    return 90;
  }

  return 0;
}

export function formatResolvedGcodeRotation(rotationDeg: GcodeRotationDeg): string {
  switch (rotationDeg) {
    case 0:
      return "As drawn";
    case 90:
      return "90 deg clockwise";
    case 180:
      return "180 deg";
    case 270:
      return "90 deg counter-clockwise";
  }
}

export function formatExportRotationSummary(
  rotationDeg: ExportRotationSetting,
  canvas: ProgramDetails["canvas"] | null | undefined,
  plotter: Pick<PlotterDeviceSummary, "page"> | null | undefined
): string {
  const resolvedRotation = resolveGcodeRotationDeg(rotationDeg, canvas, plotter);

  if (rotationDeg === "auto") {
    return resolvedRotation === 0
      ? "Auto"
      : `Auto (${formatResolvedGcodeRotation(resolvedRotation)})`;
  }

  return formatResolvedGcodeRotation(resolvedRotation);
}
