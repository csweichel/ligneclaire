import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const programsDir = path.join(rootDir, "programs");
const registryOutputPath = path.join(rootDir, "programs/generated/program-registry.ts");
const nodeComposerRegistryOutputPath = path.join(
  rootDir,
  "programs/generated/node-composer-program-registry.ts"
);

type ProgramEntry = {
  importName: string;
  importPath: string;
  folderName: string;
  programId: string;
  paramSets: readonly Readonly<{
    slug: string;
    name: string;
    params: unknown;
    programState?: unknown;
  }>[];
};

const requiredFiles = ["index.ts", "README.md", path.join("params", "default.json")];

function isProgramFolder(name: string): boolean {
  return !name.startsWith(".") && name !== "generated";
}

function toImportName(folderName: string): string {
  return folderName
    .replace(/[^A-Za-z0-9]/g, " ")
    .trim()
    .split(/\s+/)
    .map((segment, index) =>
      index === 0
        ? segment.toLowerCase()
        : `${segment.slice(0, 1).toUpperCase()}${segment.slice(1).toLowerCase()}`
    )
    .join("");
}

async function assertRequiredFiles(folderPath: string): Promise<void> {
  for (const fileName of requiredFiles) {
    const target = path.join(folderPath, fileName);
    try {
      const targetStat = await stat(target);
      if (!targetStat.isFile()) {
        throw new Error(`${target} exists but is not a file`);
      }
    } catch (error) {
      throw new Error(`Missing required program file: ${path.relative(rootDir, target)}`, {
        cause: error,
      });
    }
  }
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as unknown;
}

async function collectParamSets(
  folderPath: string
): Promise<
  readonly Readonly<{
    slug: string;
    name: string;
    params: unknown;
    programState?: unknown;
  }>[]
> {
  const paramsDir = path.join(folderPath, "params");
  const dirents = await readdir(paramsDir, { withFileTypes: true });
  const paramSets: Array<{
    slug: string;
    name: string;
    params: unknown;
    programState?: unknown;
  }> = [];

  for (const entry of dirents) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const slug = entry.name.slice(0, -5);
    const raw = await readJsonFile(path.join(paramsDir, entry.name));
    const record =
      raw !== null && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const name =
      typeof record.name === "string" && record.name.trim().length > 0
        ? record.name.trim()
        : slug;

    paramSets.push({
      slug,
      name,
      params: record.params ?? {},
      ...(record.programState !== undefined ? { programState: record.programState } : {}),
    });
  }

  return paramSets.sort((left, right) => {
    if (left.slug === "default") {
      return right.slug === "default" ? 0 : -1;
    }
    if (right.slug === "default") {
      return 1;
    }
    return left.slug.localeCompare(right.slug);
  });
}

async function collectPrograms(): Promise<ProgramEntry[]> {
  const dirents = await readdir(programsDir, { withFileTypes: true });
  const folders = dirents.filter((entry) => entry.isDirectory() && isProgramFolder(entry.name));

  const programs: ProgramEntry[] = [];
  const ids = new Set<string>();

  for (const folder of folders) {
    const folderPath = path.join(programsDir, folder.name);
    await assertRequiredFiles(folderPath);
    const moduleUrl = pathToFileURL(path.join(folderPath, "index.ts")).href;
    const module = (await import(moduleUrl)) as { program?: { id?: string } };
    const programId = module.program?.id;

    if (!programId) {
      throw new Error(`Program module ${path.relative(rootDir, folderPath)} does not export program.id`);
    }

    if (programId !== folder.name) {
      throw new Error(
        `Program folder "${folder.name}" must match program id "${programId}".`
      );
    }

    if (ids.has(programId)) {
      throw new Error(`Duplicate program id "${programId}" detected while generating the registry.`);
    }

    ids.add(programId);
    programs.push({
      folderName: folder.name,
      programId,
      importName: `${toImportName(folder.name)}Program`,
      importPath: `../${folder.name}/index`,
      paramSets: await collectParamSets(folderPath),
    });
  }

  return programs.sort((left, right) => left.folderName.localeCompare(right.folderName));
}

function renderRegistry(
  entries: ProgramEntry[],
  exportName: string
): string {
  const imports = entries
    .map((entry) => `import { program as ${entry.importName} } from "${entry.importPath}";`)
    .join("\n");

  const registry = entries.map((entry) => entry.importName).join(", ");

  return `/* eslint-disable */
// This file is generated by scripts/generate-program-registry.ts.
// Do not edit it manually.

import type { ProgramDefinition } from "@ligneclaire/sdk";
${imports ? `\n${imports}\n` : ""}
export const ${exportName} = [${registry}] as const satisfies readonly ProgramDefinition<any, any>[];
`;
}

function renderLiteral(value: unknown, indent: number): string {
  const indentation = " ".repeat(indent);
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${indentation}${line}`))
    .join("\n");
}

function renderNodeComposerRegistry(entries: ProgramEntry[]): string {
  const imports = entries
    .map((entry) => `import { program as ${entry.importName} } from "${entry.importPath}";`)
    .join("\n");

  const registry = entries
    .map((entry) => {
      const renderedParamSets = entry.paramSets
        .map(
          (paramSet) => `      {
        slug: ${JSON.stringify(paramSet.slug)},
        name: ${JSON.stringify(paramSet.name)},
        params: ${renderLiteral(paramSet.params, 10)}${paramSet.programState !== undefined ? `,
        programState: ${renderLiteral(paramSet.programState, 10)}` : ""}
      }`
        )
        .join(",\n");

      return `  {
    program: ${entry.importName},
    paramSets: [
${renderedParamSets}
    ]
  }`;
    })
    .join(",\n");

  return `/* eslint-disable */
// This file is generated by scripts/generate-program-registry.ts.
// Do not edit it manually.

import type { ProgramDefinition } from "@ligneclaire/sdk";
${imports ? `\n${imports}\n` : ""}
export const nodeComposerProgramRegistry = [${registry ? `\n${registry}\n` : ""}] as const satisfies readonly Readonly<{
  program: ProgramDefinition<any, any>;
  paramSets: readonly Readonly<{
    slug: string;
    name: string;
    params: Readonly<Record<string, unknown>>;
    programState?: unknown;
  }>[];
}>[];
`;
}

async function main(): Promise<void> {
  const entries = await collectPrograms();
  await mkdir(path.dirname(registryOutputPath), { recursive: true });
  await Promise.all([
    writeFile(registryOutputPath, renderRegistry(entries, "programRegistry"), "utf8"),
    writeFile(
      nodeComposerRegistryOutputPath,
      renderNodeComposerRegistry(
        entries.filter((entry) => entry.programId !== "node-composer")
      ),
      "utf8"
    ),
  ]);
  process.stdout.write(
    `Generated registry files for ${entries.length} program(s) at ${path.relative(rootDir, registryOutputPath)} and ${path.relative(rootDir, nodeComposerRegistryOutputPath)}\n`
  );
}

await main();
