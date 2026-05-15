import type {
  NormalizationIssue,
  ParameterSchema,
  PlotMetrics,
  PlotValidationIssue,
  ProgramDefinition,
  ProgramEditorProps,
} from "@ligneclaire/sdk";
import type {
  GcodeOversizeHandling,
  GcodeRotationDeg,
  HeightMeshFile,
  HeightMeshSamplerConfig,
  ParamSetListResponse,
  PlotterDeviceSummary,
  PlotterPenMotionConfig,
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

export type StudioPerspective = "programs" | "node-composer" | "machine-control";

export type ExportKind = "raw-svg" | "optimized-svg" | "gcode";

export type ExportRotationSetting = "auto" | GcodeRotationDeg;

export type ExportSettings = Readonly<{
  deviceId: string;
  rotationDeg: ExportRotationSetting;
  oversizeHandling: GcodeOversizeHandling;
  penMotion: PlotterPenMotionConfig;
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
  alarmResetCommand: string;
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

export type SerialTransportJobRequest = Readonly<{
  label: string;
  lines: readonly string[];
  ackTimeoutMs?: number;
  onSendLine?: (line: string, index: number) => void;
  onResponseLine?: (line: string) => void;
}>;

export type SerialTransportJobResult = Readonly<{
  label: string;
  durationMs: number;
  responseLines: readonly string[];
}>;

export type MachinePosition = Readonly<{
  x: number;
  y: number;
  z: number;
  source: "work" | "machine";
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
  canResetAlarm: boolean;
  lastError: string | null;
  lastMachineError: string | null;
  lastResponse: string | null;
  position: MachinePosition | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  prepare: () => Promise<GcodePreparedArtifact | null>;
  resetAlarm: () => Promise<void>;
  zeroCurrentAxes: (axes: readonly ("X" | "Y" | "Z")[]) => Promise<void>;
  zeroCurrentPosition: () => Promise<void>;
  runSerialJob: (request: SerialTransportJobRequest) => Promise<SerialTransportJobResult>;
  send: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  clearLogs: () => void;
  setTarget: (target: GcodeTransportTarget) => void;
  updateSettings: (patch: Partial<GcodeTransportSettings>) => void;
}>;

export type HeightMeshSettings = Readonly<{
  widthMm: number;
  heightMm: number;
  sampleDistanceMm: number;
}>;

export type HeightMeshStatus = Readonly<{
  state: "idle" | "sampling" | "complete" | "failed";
  totalSamples: number;
  capturedSamples: number;
  errorMessage: string | null;
}>;

export type HeightMeshModel = Readonly<{
  activePlotterId: string;
  activeSamplerConfig: HeightMeshSamplerConfig | null;
  deviceMismatch: boolean;
  grid: Readonly<{
    columns: number;
    rows: number;
    spacingXMm: number;
    spacingYMm: number;
  }> | null;
  mesh: HeightMeshFile | null;
  settings: HeightMeshSettings;
  status: HeightMeshStatus;
  clear: () => void;
  download: () => void;
  importFile: (file: File) => Promise<void>;
  sample: () => Promise<void>;
  setActivePlotterId: (plotterId: string) => void;
  updateSettings: (patch: Partial<HeightMeshSettings>) => void;
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
  heightMesh: HeightMeshModel;
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
  setExportRotationDeg: (rotationDeg: ExportRotationSetting) => void;
  setExportOversizeHandling: (oversizeHandling: GcodeOversizeHandling) => void;
  setExportPenMotion: (penMotion: PlotterPenMotionConfig) => void;
  saveCurrent: () => Promise<void>;
  duplicateCurrent: () => Promise<void>;
  createFromCurrent: () => Promise<void>;
  resetToDefaults: () => void;
  deleteCurrent: () => Promise<void>;
  exportRawSvg: () => Promise<void>;
  exportOptimizedSvg: () => Promise<void>;
  exportGcode: () => Promise<void>;
}>;
