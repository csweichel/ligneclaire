import type {
  NormalizationIssue,
  ParameterSchema,
  PlotMetrics,
  PlotValidationIssue,
  ProgramDefinition,
  ProgramEditorProps,
} from "@ligneclaire/sdk";
import type {
  ParamSetListResponse,
  PlotterDeviceSummary,
  ProgramDetails,
  ProgramListItem,
  ToolDiagnostics,
} from "@ligneclaire/node-runtime";
import type { ComponentType } from "react";

export type CurrentDocumentState = Readonly<{
  slug: string;
  name: string;
  params: Readonly<Record<string, number | boolean>>;
  programState: unknown;
  createdAt: string;
  updatedAt: string;
}>;

export type StudioStatusTone = "neutral" | "success" | "error";

export type StudioStatus = Readonly<{
  tone: StudioStatusTone;
  message: string;
}>;

export type ExportKind = "raw-svg" | "optimized-svg" | "gcode";

export type ExportSettings = Readonly<{
  deviceId: string;
}>;

export type AnyEditorProps = ProgramEditorProps<ParameterSchema, unknown>;
export type EditorComponent = ComponentType<AnyEditorProps>;
export type LocalProgram = ProgramDefinition<ParameterSchema, unknown>;

export type StudioModel = Readonly<{
  programs: readonly ProgramListItem[];
  selectedProgramId: string;
  programDetails: ProgramDetails | null;
  paramSetList: ParamSetListResponse;
  current: CurrentDocumentState | null;
  dirty: boolean;
  svg: string;
  metrics: PlotMetrics | null;
  normalizationIssues: readonly NormalizationIssue[];
  validationIssues: readonly PlotValidationIssue[];
  tools: ToolDiagnostics | null;
  plotters: readonly PlotterDeviceSummary[];
  status: StudioStatus;
  showDebug: boolean;
  isRendering: boolean;
  pendingExport: ExportKind | null;
  editorComponent: EditorComponent | null;
  exportSettings: ExportSettings;
  localProgram: LocalProgram | undefined;
  selectProgram: (programId: string) => void;
  selectParamSet: (slug: string) => Promise<void>;
  setCurrentName: (name: string) => void;
  updateParam: (key: string, value: number | boolean) => void;
  updateProgramState: (updater: (current: unknown) => unknown) => void;
  setShowDebug: (value: boolean) => void;
  setExportDeviceId: (deviceId: string) => void;
  saveCurrent: () => Promise<void>;
  duplicateCurrent: () => Promise<void>;
  createFromDefaults: () => Promise<void>;
  resetToDefaults: () => void;
  deleteCurrent: () => Promise<void>;
  exportRawSvg: () => Promise<void>;
  exportOptimizedSvg: () => Promise<void>;
  exportGcode: () => Promise<void>;
}>;
