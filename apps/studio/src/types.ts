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

export type GcodeTransportTarget = "serial" | "virtual";

export type GcodePreparedArtifact = Readonly<{
  fileName: string;
  content: string;
  lines: readonly string[];
  preview: Readonly<{
    lineCount: number;
    bounds: Readonly<{
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }> | null;
    segments: readonly Readonly<{
      lineNumber: number;
      from: Readonly<{
        x: number;
        y: number;
      }>;
      to: Readonly<{
        x: number;
        y: number;
      }>;
      drawing: boolean;
    }>[];
    drawingSegments: number;
    travelSegments: number;
  }>;
  snapshot: string | null;
  generatedAt: string;
}>;

export type GcodeLogEntry = Readonly<{
  id: string;
  level: "system" | "tx" | "rx" | "error";
  message: string;
  timeLabel: string;
}>;

export type GcodeTransportSettings = Readonly<{
  target: GcodeTransportTarget;
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  flowControl: "none" | "hardware";
  lineEnding: "lf" | "crlf";
  responseMode: "ack" | "timed";
  ackPattern: string;
  errorPattern: string;
  readyPattern: string;
  ackTimeoutMs: number;
  lineDelayMs: number;
  connectDelayMs: number;
}>;

export type GcodeTransportStatus = Readonly<{
  connectionState: "unsupported" | "disconnected" | "connecting" | "connected";
  jobState: "idle" | "preparing" | "ready" | "sending" | "paused" | "complete" | "failed" | "cancelled";
  progress: Readonly<{
    totalLines: number;
    sentLines: number;
    acknowledgedLines: number;
    errorLines: number;
  }>;
}>;

export type GcodeTransportModel = Readonly<{
  supported: boolean;
  settings: GcodeTransportSettings;
  connectionState: GcodeTransportStatus["connectionState"];
  portLabel: string | null;
  jobState: GcodeTransportStatus["jobState"];
  preparedArtifact: GcodePreparedArtifact | null;
  preparedStale: boolean;
  progress: GcodeTransportStatus["progress"];
  logs: readonly GcodeLogEntry[];
  lastResponse: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  prepare: () => Promise<GcodePreparedArtifact | null>;
  send: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  clearLogs: () => void;
  setTarget: (target: GcodeTransportTarget) => void;
  updateSettings: (patch: Partial<GcodeTransportSettings>) => void;
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
  showEditor: boolean;
  isRendering: boolean;
  pendingExport: ExportKind | null;
  editorComponent: EditorComponent | null;
  exportSettings: ExportSettings;
  transport: GcodeTransportModel;
  localProgram: LocalProgram | undefined;
  selectProgram: (programId: string) => void;
  selectParamSet: (slug: string) => Promise<void>;
  setCurrentName: (name: string) => void;
  updateParam: (key: string, value: number | boolean) => void;
  updateProgramState: (updater: (current: unknown) => unknown) => void;
  setShowDebug: (value: boolean) => void;
  setShowEditor: (value: boolean) => void;
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
