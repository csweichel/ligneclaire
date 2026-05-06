import type {
  CanvasSpec,
  NormalizedParams,
  ParameterSchema,
  Point,
  PlotDocument,
  ValidationBudget,
} from "@ligneclaire/engine";
import { validateParameterSchema } from "@ligneclaire/engine";
import type { ComponentType } from "react";

export type PersistedParamSet = Readonly<{
  programId: string;
  programVersion: string;
  name: string;
  params: Readonly<Record<string, unknown>>;
  programState?: unknown;
  createdAt: string;
  updatedAt: string;
}>;

export type PreviewBridge = Readonly<{
  canvasToScreen: (point: Point) => Point;
  screenToCanvas: (point: Point) => Point;
}>;

export type ProgramEditorProps<Schema extends ParameterSchema, ProgramState> = Readonly<{
  canvas: CanvasSpec;
  params: NormalizedParams<Schema>;
  programState: ProgramState;
  setParam: <Key extends keyof NormalizedParams<Schema>>(
    key: Key,
    value: NormalizedParams<Schema>[Key]
  ) => void;
  updateProgramState: (updater: (current: ProgramState) => ProgramState) => void;
  preview: PreviewBridge;
}>;

export type ProgramEditorModule<Schema extends ParameterSchema, ProgramState> = {
  default: ComponentType<ProgramEditorProps<Schema, ProgramState>>;
};

export type LazyEditorDescriptor<Schema extends ParameterSchema, ProgramState> = Readonly<{
  kind: "lazy";
  load: () => Promise<ProgramEditorModule<Schema, ProgramState>>;
}>;

export type ProgramValidationSpec = Readonly<{
  cases: readonly string[];
  budgets?: ValidationBudget;
}>;

export type ProgramAssetManifest = Readonly<Record<string, string>>;

export type ProgramRenderContext<Schema extends ParameterSchema, ProgramState> = Readonly<{
  programId: string;
  mode: "preview" | "export" | "validation";
  caseName?: string;
  showDebug: boolean;
  params: NormalizedParams<Schema>;
  programState: ProgramState;
}>;

export type ProgramDefinition<Schema extends ParameterSchema, ProgramState = Record<string, never>> =
  Readonly<{
    id: string;
    title: string;
    description: string;
    version: string;
    schemaVersion?: string;
    canvas: CanvasSpec;
    params: Schema;
    validation?: ProgramValidationSpec;
    assets?: ProgramAssetManifest;
    editor?: LazyEditorDescriptor<Schema, ProgramState>;
    defaultProgramState?: ProgramState | (() => ProgramState);
    selectRenderProgramState?: (programState: ProgramState) => unknown;
    normalizeProgramState?: (
      input: unknown,
      ctx: Readonly<{
        params: NormalizedParams<Schema>;
      }>
    ) => ProgramState;
    migrateParamSet?: (legacy: PersistedParamSet) => PersistedParamSet;
    render: (ctx: ProgramRenderContext<Schema, ProgramState>) => PlotDocument;
  }>;

const PROGRAM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function lazyEditor<Schema extends ParameterSchema, ProgramState>(
  load: LazyEditorDescriptor<Schema, ProgramState>["load"]
): LazyEditorDescriptor<Schema, ProgramState> {
  return {
    kind: "lazy",
    load,
  };
}

export function defineProgram<Schema extends ParameterSchema, ProgramState>(
  definition: ProgramDefinition<Schema, ProgramState>
): ProgramDefinition<Schema, ProgramState> {
  if (!PROGRAM_ID_PATTERN.test(definition.id)) {
    throw new Error(
      `Program id "${definition.id}" is invalid. Use lowercase ASCII slugs such as "waves".`
    );
  }

  const schemaIssues = validateParameterSchema(definition.params);
  if (schemaIssues.length > 0) {
    throw new Error(`Invalid parameter schema for "${definition.id}": ${schemaIssues.join(" ")}`);
  }

  return Object.freeze(definition);
}

export function resolveProgramState<Schema extends ParameterSchema, ProgramState>(
  program: ProgramDefinition<Schema, ProgramState>,
  params: NormalizedParams<Schema>,
  input: unknown
): ProgramState {
  if (program.normalizeProgramState) {
    return program.normalizeProgramState(input, { params });
  }

  if (input !== undefined) {
    return input as ProgramState;
  }

  if (typeof program.defaultProgramState === "function") {
    return (program.defaultProgramState as () => ProgramState)();
  }

  if (program.defaultProgramState !== undefined) {
    return structuredClone(program.defaultProgramState);
  }

  return {} as ProgramState;
}

export function summarizeProgram<Schema extends ParameterSchema, ProgramState>(
  program: ProgramDefinition<Schema, ProgramState>
): Readonly<{
  id: string;
  title: string;
  description: string;
  version: string;
  canvas: CanvasSpec;
  schemaVersion?: string;
  hasEditor: boolean;
  validationCases: readonly string[];
}> {
  return {
    id: program.id,
    title: program.title,
    description: program.description,
    version: program.version,
    schemaVersion: program.schemaVersion,
    canvas: program.canvas,
    hasEditor: Boolean(program.editor),
    validationCases: program.validation?.cases ?? [],
  };
}
