import { workspaceRoot } from "./paths";
import { runProcess } from "./process";
import type { ToolDiagnostics, ToolStatus } from "./api-types";

async function detectTool(command: string, args: readonly string[]): Promise<ToolStatus> {
  try {
    const result = await runProcess(command, args, { cwd: workspaceRoot });
    if (result.code !== 0) {
      return {
        available: false,
        error: (result.stderr || result.stdout).trim() || `${command} exited with code ${result.code}.`,
      };
    }

    return {
      available: true,
      version: result.stdout.trim() || undefined,
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : "Tool execution failed.",
    };
  }
}

export async function getToolDiagnostics(): Promise<ToolDiagnostics> {
  const vpype = await detectTool("vpype", ["--version"]);
  const vpypeGcode = vpype.available
    ? await detectTool("vpype", ["gwrite", "--help"])
    : {
        available: false,
        error: "vpype is unavailable.",
      };

  return {
    vpype,
    vpypeGcode,
  };
}

