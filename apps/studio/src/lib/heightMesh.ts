import { buildHeightMeshSamplePoints, resolveHeightMeshGrid } from "@ligneclaire/engine";
import type { PlotterDeviceSummary } from "@ligneclaire/node-runtime";
import type {
  HeightMeshFile,
  HeightMeshProbeReading,
  HeightMeshSamplerConfig,
} from "@ligneclaire/engine";
import type { HeightMeshSettings } from "../types";

const defaultSampleDistanceMm = 25;
const defaultSamplerMarginMm = 20;
const maxSamplerWidthMm = 400;
const maxSamplerHeightMm = 300;
const minSamplerSpanMm = 1;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (max < min) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function readPositiveLength(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined ? Math.max(0, value) : fallback;
}

function samplerBounds(plotter: PlotterDeviceSummary): Readonly<{
  originXMm: number;
  originYMm: number;
  widthMm: number;
  heightMm: number;
}> {
  const sampler = plotter.gcode?.heightMeshSampler;
  const pageWidthMm = Math.max(0, plotter.page.widthMm);
  const pageHeightMm = Math.max(0, plotter.page.heightMm);
  const originXMm = clamp(sampler?.originXMm ?? 0, 0, pageWidthMm);
  const originYMm = clamp(sampler?.originYMm ?? 0, 0, pageHeightMm);
  const maxWidthMm = Math.max(0, pageWidthMm - originXMm);
  const maxHeightMm = Math.max(0, pageHeightMm - originYMm);

  return {
    originXMm,
    originYMm,
    widthMm: clamp(
      readPositiveLength(sampler?.widthMm, Math.min(maxWidthMm, maxSamplerWidthMm)),
      0,
      Math.min(maxWidthMm, maxSamplerWidthMm)
    ),
    heightMm: clamp(
      readPositiveLength(sampler?.heightMm, Math.min(maxHeightMm, maxSamplerHeightMm)),
      0,
      Math.min(maxHeightMm, maxSamplerHeightMm)
    ),
  };
}

function maxSamplerMarginMm(region: Readonly<{ widthMm: number; heightMm: number }>): number {
  return Math.max(0, (Math.min(region.widthMm, region.heightMm) - minSamplerSpanMm) / 2);
}

function clampSamplerMarginMm(
  region: Readonly<{ widthMm: number; heightMm: number }>,
  marginMm: number
): number {
  return clamp(marginMm, 0, maxSamplerMarginMm(region));
}

function samplerSpanMm(sizeMm: number, marginMm: number): number {
  return Math.max(minSamplerSpanMm, sizeMm - marginMm * 2);
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
      marginMm: defaultSamplerMarginMm,
      widthMm: 0,
      heightMm: 0,
      sampleDistanceMm: defaultSampleDistanceMm,
    };
  }

  const bounds = samplerBounds(plotter);
  const marginMm = clampSamplerMarginMm(bounds, defaultSamplerMarginMm);
  const sampleWidthMm = samplerSpanMm(bounds.widthMm, marginMm);
  const sampleHeightMm = samplerSpanMm(bounds.heightMm, marginMm);

  return {
    marginMm,
    widthMm: bounds.widthMm,
    heightMm: bounds.heightMm,
    sampleDistanceMm: deriveSampleDistanceMm(plotter, sampleWidthMm, sampleHeightMm),
  };
}

export function clampHeightMeshSettings(
  plotter: PlotterDeviceSummary | null,
  settings: HeightMeshSettings
): HeightMeshSettings {
  if (!plotter) {
    return {
      marginMm: Math.max(0, settings.marginMm),
      widthMm: Math.max(0, settings.widthMm),
      heightMm: Math.max(0, settings.heightMm),
      sampleDistanceMm: Math.max(0.5, Math.abs(settings.sampleDistanceMm)),
    };
  }

  const bounds = samplerBounds(plotter);
  const widthMm = clamp(settings.widthMm, minSamplerSpanMm, bounds.widthMm);
  const heightMm = clamp(settings.heightMm, minSamplerSpanMm, bounds.heightMm);
  const marginMm = clampSamplerMarginMm({ widthMm, heightMm }, settings.marginMm);

  return {
    marginMm,
    widthMm,
    heightMm,
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
  const sampleWidthMm = samplerSpanMm(clampedSettings.widthMm, clampedSettings.marginMm);
  const sampleHeightMm = samplerSpanMm(clampedSettings.heightMm, clampedSettings.marginMm);
  const grid = resolveHeightMeshGrid(
    sampleWidthMm,
    sampleHeightMm,
    clampedSettings.sampleDistanceMm
  );
  const base = plotter.gcode.heightMeshSampler;
  const bounds = samplerBounds(plotter);

  return {
    ...base,
    columns: grid.columns,
    rows: grid.rows,
    originXMm: bounds.originXMm + clampedSettings.marginMm,
    originYMm: bounds.originYMm + clampedSettings.marginMm,
    widthMm: sampleWidthMm,
    heightMm: sampleHeightMm,
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
  const sampleWidthMm = samplerSpanMm(clampedSettings.widthMm, clampedSettings.marginMm);
  const sampleHeightMm = samplerSpanMm(clampedSettings.heightMm, clampedSettings.marginMm);
  const grid = resolveHeightMeshGrid(
    sampleWidthMm,
    sampleHeightMm,
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

export function coalesceHeightMeshProbeReadings(
  readings: readonly HeightMeshProbeReading[],
  expectedCount: number
): readonly HeightMeshProbeReading[] {
  if (readings.length !== expectedCount * 2) {
    return readings;
  }

  const collapsed: HeightMeshProbeReading[] = [];
  for (let index = 0; index < readings.length; index += 2) {
    const first = readings[index];
    const second = readings[index + 1];
    if (!first || !second) {
      return readings;
    }

    collapsed.push(first.zMm <= second.zMm ? first : second);
  }

  return collapsed;
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
