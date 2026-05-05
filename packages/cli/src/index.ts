#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createApiServer,
  createParamSet,
  defaultRenderState,
  exportGcode,
  exportSvg,
  getProgramDetails,
  getToolDiagnostics,
  listParamSets,
  listPrograms,
  loadParamSet,
  saveParamSet,
  slugify,
  toRuntimeError,
  workspaceRoot,
  validateProgram,
  RuntimeError,
} from "@ligneclaire/node-runtime";

type ParsedArgs = Readonly<{
  command?: string;
  flags: Map<string, string | boolean>;
  positionals: readonly string[];
}>;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index]!;
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const [rawKeyMaybe, rawInlineValue] = value.slice(2).split("=", 2);
    const rawKey = rawKeyMaybe ?? "";
    if (rawInlineValue !== undefined) {
      flags.set(rawKey, rawInlineValue);
      continue;
    }

    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(rawKey, next);
      index += 1;
    } else {
      flags.set(rawKey, true);
    }
  }

  return {
    command,
    flags,
    positionals,
  };
}

function getStringFlag(args: ParsedArgs, name: string, required = false): string | undefined {
  const value = args.flags.get(name);
  if (typeof value === "string") {
    return value;
  }

  if (required) {
    throw new RuntimeError("MISSING_FLAG", `Missing required flag --${name}.`, {
      status: 400,
    });
  }

  return undefined;
}

function getBooleanFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.get(name) === true;
}

function output(payload: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (typeof payload === "string") {
    process.stdout.write(`${payload}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function scaffoldProgram(programId: string): Promise<void> {
  const root = path.join(workspaceRoot, "templates", "program");
  const target = path.join(workspaceRoot, "programs", programId);
  await mkdir(path.join(target, "params"), { recursive: true });
  await mkdir(path.join(target, "tests"), { recursive: true });

  const replacements = new Map<string, string>([
    ["__PROGRAM_ID__", programId],
    ["__PROGRAM_TITLE__", programId
      .split("-")
      .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
      .join(" ")],
  ]);

  for (const relativePath of [
    "index.ts",
    "editor.tsx",
    "README.md",
    "params/default.json",
    "tests/program.test.ts",
  ]) {
    const templatePath = path.join(root, relativePath);
    const targetPath =
      relativePath === "tests/program.test.ts"
        ? path.join(target, "tests", `${programId}.test.ts`)
        : path.join(target, relativePath);
    const template = await readFile(templatePath, "utf8");
    let rendered = template;
    for (const [key, value] of replacements) {
      rendered = rendered.replaceAll(key, value);
    }
    await writeFile(targetPath, rendered, "utf8");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const json = getBooleanFlag(args, "json");

  switch (args.command) {
    case "list-programs": {
      output(listPrograms(), json);
      return;
    }

    case "list-params": {
      const programId = getStringFlag(args, "program", true)!;
      output(await listParamSets(programId), json);
      return;
    }

    case "render": {
      const programId = getStringFlag(args, "program", true)!;
      const paramSetId = getStringFlag(args, "params", true)!;
      const outPath = getStringFlag(args, "out", true)!;
      output(await exportSvg({ programId, paramSetId, outPath }), json);
      return;
    }

    case "optimize-svg": {
      const programId = getStringFlag(args, "program", true)!;
      const paramSetId = getStringFlag(args, "params", true)!;
      const outPath = getStringFlag(args, "out", true)!;
      output(await exportSvg({ programId, paramSetId, outPath, optimized: true }), json);
      return;
    }

    case "export-gcode": {
      const programId = getStringFlag(args, "program", true)!;
      const paramSetId = getStringFlag(args, "params", true)!;
      const deviceId = getStringFlag(args, "device", true)!;
      const outPath = getStringFlag(args, "out", true)!;
      output(await exportGcode({ programId, paramSetId, deviceId, outPath }), json);
      return;
    }

    case "validate-program": {
      const programId = getStringFlag(args, "program", true)!;
      const outDir = getStringFlag(args, "out-dir", false) ?? `.artifacts/validate/${programId}`;
      const report = await validateProgram(programId, outDir, getBooleanFlag(args, "strict"));
      output(report, json);
      return;
    }

    case "create-program": {
      const programId = getStringFlag(args, "id", true)!;
      await scaffoldProgram(slugify(programId));
      output(`Created scaffold in programs/${programId}`, json);
      return;
    }

    case "serve": {
      const host = getStringFlag(args, "host", false) ?? "127.0.0.1";
      const port = Number(getStringFlag(args, "port", false) ?? "7345");
      const api = createApiServer(port, host);
      await api.listen();
      output(`Runtime listening on http://${host}:${port}`, json);
      return;
    }

    case "get-program": {
      const programId = getStringFlag(args, "program", true)!;
      output(getProgramDetails(programId), json);
      return;
    }

    case "get-param-set": {
      const programId = getStringFlag(args, "program", true)!;
      const paramSetId = getStringFlag(args, "params", true)!;
      output(await loadParamSet(programId, paramSetId), json);
      return;
    }

    case "create-param-set": {
      const programId = getStringFlag(args, "program", true)!;
      const name = getStringFlag(args, "name", true)!;
      const sourceSlug = getStringFlag(args, "from", false);
      output(await createParamSet(programId, { name, sourceSlug }), json);
      return;
    }

    case "save-param-set": {
      const programId = getStringFlag(args, "program", true)!;
      const currentSlug = getStringFlag(args, "params", true)!;
      const details = await loadParamSet(programId, currentSlug);
      output(
        await saveParamSet(programId, currentSlug, {
          name: getStringFlag(args, "name", false) ?? details.name,
          params: details.params,
          programState: details.programState,
        }),
        json
      );
      return;
    }

    case "defaults": {
      const programId = getStringFlag(args, "program", true)!;
      output(defaultRenderState(programId), json);
      return;
    }

    case "tools": {
      output(await getToolDiagnostics(), json);
      return;
    }

    default: {
      throw new RuntimeError(
        "UNKNOWN_COMMAND",
        `Unknown command "${args.command ?? ""}". Available commands: list-programs, list-params, render, optimize-svg, export-gcode, validate-program, create-program, serve.`,
        {
          status: 400,
        }
      );
    }
  }
}

main().catch((error) => {
  const runtimeError = toRuntimeError(error);
  process.stderr.write(`${runtimeError.code}: ${runtimeError.message}\n`);
  process.exit(1);
});
