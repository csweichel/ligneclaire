import { access, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeParams, type NormalizedParams, type ParameterSchema } from "@ligneclaire/engine";
import { resolveProgramState, type PersistedParamSet, type ProgramDefinition } from "@ligneclaire/sdk";
import { RuntimeError } from "./errors";
import { ensureDirectory, resolveProgramParamFile, resolveProgramParamsDir, slugify } from "./paths";
import { getProgram } from "./registry";
import type {
  CreateParamSetRequest,
  LoadedParamSet,
  ParamSetListResponse,
  ParamSetSummary,
  SaveParamSetRequest,
} from "./api-types";

type ValidatedParamSet<Schema extends ParameterSchema, ProgramState> = Readonly<{
  raw: PersistedParamSet;
  normalizedParams: NormalizedParams<Schema>;
  normalizedProgramState: ProgramState;
  normalizationIssues: ReturnType<typeof normalizeParams<Schema>>["issues"];
}>;

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new RuntimeError("INVALID_JSON", `Failed to read JSON file ${filePath}.`, {
      status: 400,
      cause: error,
    });
  }
}

function defaultsFromSchema<Schema extends ParameterSchema>(schema: Schema): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(schema).map(([key, spec]) => [key, spec.default]));
}

function validatePersistedParamSet<Schema extends ParameterSchema, ProgramState>(
  program: ProgramDefinition<Schema, ProgramState>,
  candidate: unknown
): ValidatedParamSet<Schema, ProgramState> {
  if (!isRecord(candidate)) {
    throw new RuntimeError("INVALID_PARAM_SET", "Parameter set file must contain an object.", {
      status: 400,
    });
  }

  let raw = candidate as PersistedParamSet;

  if (raw.programVersion !== program.version && program.migrateParamSet) {
    raw = program.migrateParamSet(raw);
  }

  if (raw.programId !== program.id) {
    throw new RuntimeError(
      "PROGRAM_MISMATCH",
      `Parameter set program id "${raw.programId}" does not match "${program.id}".`,
      { status: 400 }
    );
  }

  if (typeof raw.programVersion !== "string" || raw.programVersion.length === 0) {
    throw new RuntimeError("INVALID_PARAM_SET", "Parameter set is missing programVersion.", {
      status: 400,
    });
  }

  if (raw.programVersion !== program.version && !program.migrateParamSet) {
    throw new RuntimeError(
      "PARAM_SET_VERSION_MISMATCH",
      `Parameter set version "${raw.programVersion}" does not match current program version "${program.version}".`,
      { status: 409 }
    );
  }

  if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
    throw new RuntimeError("INVALID_PARAM_SET", "Parameter set is missing a valid name.", {
      status: 400,
    });
  }

  if (typeof raw.createdAt !== "string" || Number.isNaN(Date.parse(raw.createdAt))) {
    throw new RuntimeError("INVALID_PARAM_SET", "Parameter set is missing a valid createdAt timestamp.", {
      status: 400,
    });
  }

  if (typeof raw.updatedAt !== "string" || Number.isNaN(Date.parse(raw.updatedAt))) {
    throw new RuntimeError("INVALID_PARAM_SET", "Parameter set is missing a valid updatedAt timestamp.", {
      status: 400,
    });
  }

  const normalized = normalizeParams(program.params, raw.params);
  const normalizedProgramState = resolveProgramState(program, normalized.params, raw.programState);

  return {
    raw,
    normalizedParams: normalized.params,
    normalizedProgramState,
    normalizationIssues: normalized.issues,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureUniqueSlug(programId: string, requestedSlug: string, excludeSlug?: string): Promise<string> {
  let attempt = requestedSlug;
  let counter = 2;

  while (true) {
    const candidatePath = resolveProgramParamFile(programId, attempt);
    const exists = await pathExists(candidatePath);
    if (!exists || attempt === excludeSlug) {
      return attempt;
    }

    attempt = `${requestedSlug}-${counter}`;
    counter += 1;
  }
}

async function writeJsonAtomic(targetPath: string, data: unknown): Promise<void> {
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  const parentDir = path.dirname(targetPath);
  const tempFile = path.join(
    parentDir,
    `.${path.basename(targetPath)}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}.tmp`
  );

  try {
    await ensureDirectory(parentDir);
    await writeFile(tempFile, serialized, "utf8");
    await rename(tempFile, targetPath);
  } catch (error) {
    throw new RuntimeError("WRITE_FAILED", `Failed to write ${targetPath}.`, {
      status: 500,
      cause: error,
    });
  }
}

function toLoadedParamSet<Schema extends ParameterSchema, ProgramState>(
  slug: string,
  validated: ValidatedParamSet<Schema, ProgramState>
): LoadedParamSet {
  return {
    slug,
    name: validated.raw.name,
    createdAt: validated.raw.createdAt,
    updatedAt: validated.raw.updatedAt,
    programVersion: validated.raw.programVersion,
    params: validated.normalizedParams,
    programState: validated.normalizedProgramState,
    normalizationIssues: validated.normalizationIssues,
  };
}

export async function listParamSets(programId: string): Promise<ParamSetListResponse> {
  const program = getProgram(programId);
  const paramsDir = resolveProgramParamsDir(programId);

  const files = await readdir(paramsDir, { withFileTypes: true });
  const items: ParamSetSummary[] = [];
  const invalid: Array<{ slug: string; message: string }> = [];

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".json")) {
      continue;
    }

    const slug = file.name.slice(0, -5);
    try {
      const raw = await readJsonFile(resolveProgramParamFile(programId, slug));
      const validated = validatePersistedParamSet(program, raw);
      items.push({
        slug,
        name: validated.raw.name,
        createdAt: validated.raw.createdAt,
        updatedAt: validated.raw.updatedAt,
        programVersion: validated.raw.programVersion,
      });
    } catch (error) {
      invalid.push({
        slug,
        message: error instanceof Error ? error.message : "Invalid parameter set.",
      });
    }
  }

  items.sort((left, right) => left.name.localeCompare(right.name));
  invalid.sort((left, right) => left.slug.localeCompare(right.slug));

  return {
    items,
    invalid,
  };
}

export async function loadParamSet(programId: string, slug: string): Promise<LoadedParamSet> {
  const program = getProgram(programId);
  const raw = await readJsonFile(resolveProgramParamFile(programId, slug));
  const validated = validatePersistedParamSet(program, raw);
  return toLoadedParamSet(slug, validated);
}

export async function createParamSet(
  programId: string,
  request: CreateParamSetRequest
): Promise<LoadedParamSet> {
  const program = getProgram(programId);
  const name = request.name.trim();
  if (name.length === 0) {
    throw new RuntimeError("INVALID_NAME", "Parameter set name cannot be empty.", {
      status: 400,
    });
  }

  const source =
    request.sourceSlug !== undefined
      ? await loadParamSet(programId, request.sourceSlug)
      : null;
  const normalized = normalizeParams(
    program.params,
    request.params ?? source?.params ?? defaultsFromSchema(program.params)
  );
  const programState = resolveProgramState(
    program,
    normalized.params,
    request.programState !== undefined ? request.programState : source?.programState
  );

  const slug = await ensureUniqueSlug(programId, slugify(name));
  const createdAt = nowIso();

  const persisted: PersistedParamSet = {
    programId: program.id,
    programVersion: program.version,
    name,
    params: normalized.params,
    programState,
    createdAt,
    updatedAt: createdAt,
  };

  await writeJsonAtomic(resolveProgramParamFile(programId, slug), persisted);
  return await loadParamSet(programId, slug);
}

export async function saveParamSet(
  programId: string,
  currentSlug: string,
  request: SaveParamSetRequest
): Promise<LoadedParamSet> {
  const program = getProgram(programId);
  const existing = await loadParamSet(programId, currentSlug);
  const name = request.name.trim();

  if (name.length === 0) {
    throw new RuntimeError("INVALID_NAME", "Parameter set name cannot be empty.", {
      status: 400,
    });
  }

  const nextSlug = await ensureUniqueSlug(programId, slugify(name), currentSlug);
  const normalized = normalizeParams(program.params, request.params);
  const programState = resolveProgramState(program, normalized.params, request.programState);

  const persisted: PersistedParamSet = {
    programId: program.id,
    programVersion: program.version,
    name,
    params: normalized.params,
    programState,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  };

  await writeJsonAtomic(resolveProgramParamFile(programId, nextSlug), persisted);

  if (nextSlug !== currentSlug) {
    await unlink(resolveProgramParamFile(programId, currentSlug));
  }

  return await loadParamSet(programId, nextSlug);
}

export async function deleteParamSet(programId: string, slug: string): Promise<void> {
  await unlink(resolveProgramParamFile(programId, slug));
}

export function defaultRenderState(programId: string): Readonly<{
  params: Readonly<Record<string, unknown>>;
  programState: unknown;
}> {
  const program = getProgram(programId);
  const normalized = normalizeParams(program.params, {});
  return {
    params: normalized.params,
    programState: resolveProgramState(program, normalized.params, undefined),
  };
}
