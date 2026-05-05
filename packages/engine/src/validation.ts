import { canvasBounds, contentBounds, isFinitePoint, type PlotDocument, type Polyline } from "./document";
import { pointInBounds } from "./geometry";
import type { PlotMetrics } from "./metrics";

export type ValidationBudget = Readonly<{
  maxRenderMs?: number;
  maxArtLayers?: number;
  maxPaths?: number;
  maxSegments?: number;
  maxDrawDistanceMm?: number;
  maxPenUpDistanceMm?: number;
}>;

export type PlotValidationIssue = Readonly<{
  path: string;
  message: string;
  severity: "error" | "warning";
}>;

export type BudgetCheck = Readonly<{
  name: string;
  ok: boolean;
  actual: number;
  limit: number;
}>;

function hasDegenerateGeometry(polyline: Polyline): boolean {
  if (polyline.points.length < 2) {
    return true;
  }

  const [first, ...rest] = polyline.points;
  return rest.every((point) => point.x === first!.x && point.y === first!.y);
}

export function validatePlotDocument(document: PlotDocument): readonly PlotValidationIssue[] {
  const issues: PlotValidationIssue[] = [];

  if (!Number.isFinite(document.canvas.widthMm) || document.canvas.widthMm <= 0) {
    issues.push({
      path: "canvas.widthMm",
      message: "Canvas width must be a positive finite number.",
      severity: "error",
    });
  }

  if (!Number.isFinite(document.canvas.heightMm) || document.canvas.heightMm <= 0) {
    issues.push({
      path: "canvas.heightMm",
      message: "Canvas height must be a positive finite number.",
      severity: "error",
    });
  }

  const allowedBounds = canvasBounds(document.canvas);
  const safeContentBounds = contentBounds(document.canvas);

  const layerGroups = [
    ["layers", document.layers] as const,
    ["debugLayers", document.debugLayers ?? []] as const,
  ];

  for (const [groupName, layers] of layerGroups) {
    for (const [layerIndex, layer] of layers.entries()) {
      for (const [pathIndex, path] of layer.paths.entries()) {
        if (hasDegenerateGeometry(path)) {
          issues.push({
            path: `${groupName}[${layerIndex}].paths[${pathIndex}]`,
            message: "Polylines must contain at least two distinct points.",
            severity: "error",
          });
        }

        for (const [pointIndex, point] of path.points.entries()) {
          if (!isFinitePoint(point)) {
            issues.push({
              path: `${groupName}[${layerIndex}].paths[${pathIndex}].points[${pointIndex}]`,
              message: "Polyline points must use finite coordinates.",
              severity: "error",
            });
            continue;
          }

          if (!pointInBounds(point, allowedBounds)) {
            issues.push({
              path: `${groupName}[${layerIndex}].paths[${pathIndex}].points[${pointIndex}]`,
              message: "Geometry falls outside the declared canvas bounds.",
              severity: "error",
            });
          } else if (!pointInBounds(point, safeContentBounds)) {
            issues.push({
              path: `${groupName}[${layerIndex}].paths[${pathIndex}].points[${pointIndex}]`,
              message: "Geometry enters the canvas margin area.",
              severity: "warning",
            });
          }
        }
      }
    }
  }

  return issues;
}

export function evaluateMetricsAgainstBudgets(
  metrics: PlotMetrics,
  budgets: ValidationBudget | undefined
): readonly BudgetCheck[] {
  if (!budgets) {
    return [];
  }

  const checks: BudgetCheck[] = [];

  const candidates = [
    ["maxArtLayers", metrics.artLayerCount],
    ["maxPaths", metrics.pathCount],
    ["maxSegments", metrics.segmentCount],
    ["maxDrawDistanceMm", metrics.drawDistanceMm],
    ["maxPenUpDistanceMm", metrics.penUpDistanceMm],
  ] as const;

  for (const [name, actual] of candidates) {
    const limit = budgets[name];
    if (limit === undefined) {
      continue;
    }

    checks.push({
      name,
      ok: actual <= limit,
      actual,
      limit,
    });
  }

  return checks;
}

