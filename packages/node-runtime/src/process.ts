import { spawn } from "node:child_process";
import type { SpawnOptionsWithoutStdio } from "node:child_process";

export type ProcessResult = Readonly<{
  code: number;
  stdout: string;
  stderr: string;
}>;

export async function runProcess(
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio = {}
): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      ...options,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

