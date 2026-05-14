import { buildHeightMeshSamplePoints, resolveHeightMeshGrid } from "@ligneclaire/engine";
import type { PlotterDeviceSummary } from "@ligneclaire/node-runtime";
import type { HeightMeshFile, HeightMeshSamplerConfig } from "@ligneclaire/engine";
import type { HeightMeshSettings } from "../types";

const defaultSampleDistanceMm = 25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deriveSampleDistanceMm(
  plotter: PlotterDeviceSummary,
  widthMm: number,
  heightMm: number
): number {
  const sampler = plotter.gcode?.heightMeshSampler;
  if (!sampler) {
    return defaultSampleDistanceMm;
  }

  const distances = [
    sampler.columns > 1 ? widthMm / (sampler.columns - 1) : 0,
    sampler.rows > 1 ? heightMm / (sampler.rows - 1) : 0,
  ].filter((value) => Number.isFinite(value) && value > 0);

  return distances.length > 0 ? distances[0]! : defaultSampleDistanceMm;
}

export function deriveDefaultHeightMeshSettings(
  plotter: PlotterDeviceSummary | null
): HeightMeshSettings {
  if (!plotter) {
    return {
      widthMm: 0,
      heightMm: 0,
      sampleDistanceMm: defaultSampleDistanceMm,
    };
  }

  const sampler = plotter.gcode?.heightMeshSampler;
  const maxWidthMm = plotter.page.widthMm - (sampler?.originXMm ?? 0);
  const maxHeightMm = plotter.page.heightMm - (sampler?.originYMm ?? 0);
  const widthMm = clamp(
    sampler?.widthMm ?? maxWidthMm,
    1,
    maxWidthMm
  );
  const heightMm = clamp(
    sampler?.heightMm ?? maxHeightMm,
    1,
    maxHeightMm
  );

  return {
    widthMm,
    heightMm,
    sampleDistanceMm: deriveSampleDistanceMm(plotter, widthMm, heightMm),
  };
}

export function clampHeightMeshSettings(
  plotter: PlotterDeviceSummary | null,
  settings: HeightMeshSettings
): HeightMeshSettings {
  if (!plotter) {
    return settings;
  }

  const maxWidthMm = plotter.page.widthMm - (plotter.gcode?.heightMeshSampler?.originXMm ?? 0);
  const maxHeightMm = plotter.page.heightMm - (plotter.gcode?.heightMeshSampler?.originYMm ?? 0);

  return {
    widthMm: clamp(settings.widthMm, 1, maxWidthMm),
    heightMm: clamp(settings.heightMm, 1, maxHeightMm),
    sampleDistanceMm: Math.max(0.5, Math.abs(settings.sampleDistanceMm)),
  };
}

export function buildHeightMeshSamplerConfig(
  plotter: PlotterDeviceSummary | null,
  settings: HeightMeshSettings
): HeightMeshSamplerConfig | null {
  if (!plotter?.gcode?.heightMeshSampler) {
    return null;
  }

  const clampedSettings = clampHeightMeshSettings(plotter, settings);
  const grid = resolveHeightMeshGrid(
    clampedSettings.widthMm,
    clampedSettings.heightMm,
    clampedSettings.sampleDistanceMm
  );
  const base = plotter.gcode.heightMeshSampler;

  return {
    ...base,
    columns: grid.columns,
    rows: grid.rows,
    originXMm: base.originXMm ?? 0,
    originYMm: base.originYMm ?? 0,
    widthMm: clampedSettings.widthMm,
    heightMm: clampedSettings.heightMm,
  };
}

export function buildHeightMeshGridPreview(
  plotter: PlotterDeviceSummary | null,
  settings: HeightMeshSettings
): Readonly<{
  columns: number;
  rows: number;
  spacingXMm: number;
  spacingYMm: number;
}> | null {
  if (!plotter) {
    return null;
  }

  const clampedSettings = clampHeightMeshSettings(plotter, settings);
  const grid = resolveHeightMeshGrid(
    clampedSettings.widthMm,
    clampedSettings.heightMm,
    clampedSettings.sampleDistanceMm
  );

  return {
    columns: grid.columns,
    rows: grid.rows,
    spacingXMm: grid.spacingXMm,
    spacingYMm: grid.spacingYMm,
  };
}

function estimateMoveDurationMs(distanceMm: number, feedRateMmPerMin: number): number {
  const safeDistanceMm = Math.max(0, Math.abs(distanceMm));
  const safeFeedRateMmPerMin = Math.max(1, Math.abs(feedRateMmPerMin));
  return (safeDistanceMm / safeFeedRateMmPerMin) * 60_000;
}

export function estimateHeightMeshAckTimeoutMs(
  plotter: PlotterDeviceSummary | null,
  config: HeightMeshSamplerConfig | null,
  fallbackAckTimeoutMs: number
): number {
  const safeFallbackAckTimeoutMs = Math.max(1000, Math.round(fallbackAckTimeoutMs));
  if (!plotter || !config) {
    return safeFallbackAckTimeoutMs;
  }

  const samplePoints = buildHeightMeshSamplePoints(plotter.page, config);
  let maxTravelDistanceMm = 0;

  for (let index = 1; index < samplePoints.length; index += 1) {
    const previousPoint = samplePoints[index - 1]!;
    const currentPoint = samplePoints[index]!;
    maxTravelDistanceMm = Math.max(
      maxTravelDistanceMm,
      Math.hypot(
        currentPoint.xMm - previousPoint.xMm,
        currentPoint.yMm - previousPoint.yMm
      )
    );
  }

  const longestMoveDurationMs = Math.max(
    estimateMoveDurationMs(maxTravelDistanceMm, config.moveFeedRateMmPerMin),
    estimateMoveDurationMs(config.probeDepthMm, config.probeFeedRateMmPerMin),
    estimateMoveDurationMs(config.releaseDistanceMm, config.releaseFeedRateMmPerMin),
    estimateMoveDurationMs(config.clearanceMm ?? 0, config.moveFeedRateMmPerMin)
  );

  return Math.ceil(
    Math.max(
      safeFallbackAckTimeoutMs * 3,
      longestMoveDurationMs * 1.5 + 1000
    )
  );
}

export function createHeightMeshDownloadName(mesh: HeightMeshFile): string {
  const timestamp = mesh.createdAt.replace(/[:.]/g, "-");
  return `${mesh.plotter.id}-height-mesh-${mesh.grid.columns}x${mesh.grid.rows}-${timestamp}.json`;
}

export function downloadHeightMeshFile(mesh: HeightMeshFile): void {
  const blob = new Blob([JSON.stringify(mesh, null, 2)], {
    type: "application/json; charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = createHeightMeshDownloadName(mesh);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}
