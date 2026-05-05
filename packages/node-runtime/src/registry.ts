import type { ParameterSchema } from "@ligneclaire/engine";
import { summarizeProgram, type ProgramDefinition } from "@ligneclaire/sdk";
import { programRegistry } from "../../../programs/generated/program-registry";
import { RuntimeError } from "./errors";
import type { ProgramDetails, ProgramListItem } from "./api-types";

export type AnyProgram = ProgramDefinition<ParameterSchema, unknown>;

const programsById = new Map<string, AnyProgram>();
const registryEntries = programRegistry as unknown as readonly AnyProgram[];

for (const program of registryEntries) {
  if (programsById.has(program.id)) {
    throw new RuntimeError("DUPLICATE_PROGRAM_ID", `Duplicate program id "${program.id}" in registry.`, {
      status: 500,
    });
  }

  programsById.set(program.id, program);
}

export function listPrograms(): readonly ProgramListItem[] {
  return [...programsById.values()]
    .map((program) => summarizeProgram(program))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getProgram(programId: string): AnyProgram {
  const program = programsById.get(programId);
  if (!program) {
    throw new RuntimeError("PROGRAM_NOT_FOUND", `Unknown program "${programId}".`, {
      status: 404,
    });
  }
  return program;
}

export function getProgramDetails(programId: string): ProgramDetails {
  const program = getProgram(programId);
  return {
    ...summarizeProgram(program),
    params: program.params,
    assets: program.assets,
    validation: program.validation,
  };
}
