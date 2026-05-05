import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateMetricsAgainstBudgets } from "@ligneclaire/engine";
import { RuntimeError } from "./errors";
import type { ValidationReport } from "./api-types";
import { loadParamSet } from "./param-store";
import { resolveExportPath, workspaceRelative } from "./paths";
import { getProgram } from "./registry";
import { renderProgram } from "./render";

export async function validateProgram(
  programId: string,
  outDir: string,
  strict: boolean
): Promise<ValidationReport> {
  const program = getProgram(programId);
  const cases = program.validation?.cases ?? ["default"];
  const targetDir = resolveExportPath(outDir);
  await mkdir(targetDir, { recursive: true });

  const reports: Array<ValidationReport["cases"][number]> = [];
  let success = true;

  for (const caseId of cases) {
    const paramSet = await loadParamSet(programId, caseId);

    const firstStart = performance.now();
    const first = await renderProgram({
      programId,
      paramSetId: caseId,
      showDebug: true,
      mode: "validation",
      caseName: caseId,
    });
    const firstDuration = performance.now() - firstStart;

    const secondStart = performance.now();
    const second = await renderProgram({
      programId,
      paramSetId: caseId,
      showDebug: true,
      mode: "validation",
      caseName: caseId,
    });
    const secondDuration = performance.now() - secondStart;

    const caseDir = path.join(targetDir, caseId);
    await mkdir(caseDir, { recursive: true });
    const rawSvgPath = path.join(caseDir, "preview.svg");
    const debugSvgPath = path.join(caseDir, "debug-preview.svg");

    await writeFile(rawSvgPath, first.svg, "utf8");
    await writeFile(debugSvgPath, second.svg, "utf8");

    const deterministic =
      first.svg === second.svg &&
      JSON.stringify(first.metrics) === JSON.stringify(second.metrics);
    const budgetChecks = evaluateMetricsAgainstBudgets(first.metrics, program.validation?.budgets);
    const hasErrors = first.validationIssues.some((issue) => issue.severity === "error");
    const hasBudgetFailures = budgetChecks.some((check) => !check.ok);

    if (!deterministic || hasErrors || hasBudgetFailures) {
      success = false;
    }

    reports.push({
      caseId,
      deterministic,
      durationMs: Number(firstDuration.toFixed(3)),
      repeatDurationMs: Number(secondDuration.toFixed(3)),
      normalizationIssues: [...paramSet.normalizationIssues, ...first.normalizationIssues],
      validationIssues: first.validationIssues,
      budgetChecks,
      metrics: first.metrics,
      artifactPaths: {
        rawSvg: workspaceRelative(rawSvgPath),
        debugSvg: workspaceRelative(debugSvgPath),
      },
    });
  }

  const report: ValidationReport = {
    programId,
    strict,
    generatedAt: new Date().toISOString(),
    budgets: program.validation?.budgets,
    cases: reports,
    success,
  };

  const reportPath = path.join(targetDir, "validation-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (strict && !report.success) {
    throw new RuntimeError("VALIDATION_FAILED", `Validation failed for "${programId}".`, {
      status: 422,
      details: report,
    });
  }

  return report;
}
