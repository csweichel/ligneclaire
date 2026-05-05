import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeError } from "./errors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const workspaceRoot = path.resolve(__dirname, "../../..");

function normalizeBase(basePath: string): string {
  return path.resolve(basePath);
}

export function ensureWithin(basePath: string, targetPath: string): string {
  const normalizedBase = normalizeBase(basePath);
  const normalizedTarget = path.resolve(targetPath);

  if (normalizedTarget === normalizedBase) {
    return normalizedTarget;
  }

  if (!normalizedTarget.startsWith(`${normalizedBase}${path.sep}`)) {
    throw new RuntimeError("PATH_OUTSIDE_WORKSPACE", "Resolved path escapes the allowed root.", {
      status: 400,
      details: {
        basePath: normalizedBase,
        targetPath: normalizedTarget,
      },
    });
  }

  return normalizedTarget;
}

export function workspaceRelative(targetPath: string): string {
  return path.relative(workspaceRoot, targetPath) || ".";
}

export function resolveWorkspacePath(targetPath: string): string {
  return ensureWithin(workspaceRoot, path.resolve(workspaceRoot, targetPath));
}

export function resolveProgramDir(programId: string): string {
  return ensureWithin(workspaceRoot, path.join(workspaceRoot, "programs", programId));
}

export function resolveProgramParamsDir(programId: string): string {
  return ensureWithin(resolveProgramDir(programId), path.join(resolveProgramDir(programId), "params"));
}

export function resolveProgramParamFile(programId: string, slug: string): string {
  return ensureWithin(resolveProgramParamsDir(programId), path.join(resolveProgramParamsDir(programId), `${slug}.json`));
}

export function resolvePlotterConfigPath(deviceId: string): string {
  return ensureWithin(
    path.join(workspaceRoot, "config", "plotters"),
    path.join(workspaceRoot, "config", "plotters", `${deviceId}.json`)
  );
}

export function resolveExportPath(outputPath: string): string {
  const resolved = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(workspaceRoot, outputPath);
  return ensureWithin(workspaceRoot, resolved);
}

export async function ensureDirectory(targetPath: string): Promise<void> {
  await mkdir(targetPath, { recursive: true });
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new RuntimeError("INVALID_NAME", "A non-empty ASCII-safe name is required.", {
      status: 400,
    });
  }

  return slug;
}

