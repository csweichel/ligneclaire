import type { NormalizationIssue, ParameterSchema, PlotMetrics, PlotValidationIssue, ValidationBudget, BudgetCheck } from "@ligneclaire/engine";
import type { PersistedParamSet, ProgramValidationSpec } from "@ligneclaire/sdk";

export type ProgramListItem = Readonly<{
  id: string;
  title: string;
  description: string;
  version: string;
  schemaVersion?: string;
  canvas: Readonly<{
    widthMm: number;
    heightMm: number;
    marginMm: number;
  }>;
  hasEditor: boolean;
  validationCases: readonly string[];
}>;

export type ProgramDetails = ProgramListItem &
  Readonly<{
    params: ParameterSchema;
    validation?: ProgramValidationSpec;
    assets?: Readonly<Record<string, string>>;
  }>;

export type ParamSetSummary = Readonly<{
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  programVersion: string;
}>;

export type ParamSetListResponse = Readonly<{
  items: readonly ParamSetSummary[];
  invalid: readonly Readonly<{
    slug: string;
    message: string;
  }>[];
}>;

export type LoadedParamSet = ParamSetSummary &
  Readonly<{
    params: Readonly<Record<string, unknown>>;
    programState?: unknown;
    normalizationIssues: readonly NormalizationIssue[];
  }>;

export type RenderRequest = Readonly<{
  programId: string;
  paramSetId?: string;
  params?: Readonly<Record<string, unknown>>;
  programState?: unknown;
  showDebug?: boolean;
  mode?: "preview" | "export" | "validation";
  caseName?: string;
}>;

export type RenderResponse = Readonly<{
  programId: string;
  svg: string;
  metrics: PlotMetrics;
  params: Readonly<Record<string, unknown>>;
  programState?: unknown;
  normalizationIssues: readonly NormalizationIssue[];
  validationIssues: readonly PlotValidationIssue[];
}>;

export type DownloadSvgRequest = RenderRequest &
  Readonly<{
    optimized?: boolean;
    downloadName?: string;
  }>;

export type DownloadGcodeRequest = RenderRequest &
  Readonly<{
    deviceId: string;
    downloadName?: string;
  }>;

export type ExportSvgRequest = RenderRequest &
  Readonly<{
    outPath: string;
    optimized?: boolean;
  }>;

export type ExportGcodeRequest = RenderRequest &
  Readonly<{
    deviceId: string;
    outPath: string;
  }>;

export type ExportResponse = Readonly<{
  outPath: string;
  metrics: PlotMetrics;
}>;

export type DownloadArtifact = Readonly<{
  fileName: string;
  contentType: string;
  content: string;
}>;

export type ToolStatus = Readonly<{
  available: boolean;
  version?: string;
  error?: string;
}>;

export type ToolDiagnostics = Readonly<{
  vpype: ToolStatus;
  vpypeGcode: ToolStatus;
}>;

export type PlotterGcodeConfig = Readonly<{
  unit: "mm" | "in";
  feedRateMmPerMin: number;
  travelCommand?: "G0" | "G1";
  travelFeedRateMmPerMin?: number;
  penUpCommand: string;
  penDownCommand: string;
  verticalFlip: boolean;
}>;

export type PlotterSerialTransportConfig = Readonly<{
  kind: "serial";
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  flowControl?: "none" | "hardware";
  lineEnding?: "lf" | "crlf";
  responseMode?: "ack" | "timed";
  ackPattern?: string;
  errorPattern?: string;
  readyPattern?: string;
  ackTimeoutMs?: number;
  lineDelayMs?: number;
  connectDelayMs?: number;
  usbVendorId?: number;
  usbProductId?: number;
}>;

export type PlotterTransportConfig = PlotterSerialTransportConfig;

export type PlotterDeviceSummary = Readonly<{
  id: string;
  label: string;
  page: Readonly<{
    widthMm: number;
    heightMm: number;
  }>;
  transport?: PlotterTransportConfig;
}>;

export type ValidationCaseReport = Readonly<{
  caseId: string;
  deterministic: boolean;
  durationMs: number;
  repeatDurationMs: number;
  normalizationIssues: readonly NormalizationIssue[];
  validationIssues: readonly PlotValidationIssue[];
  budgetChecks: readonly BudgetCheck[];
  metrics: PlotMetrics;
  artifactPaths: Readonly<{
    rawSvg: string;
    debugSvg?: string;
  }>;
}>;

export type ValidationReport = Readonly<{
  programId: string;
  strict: boolean;
  generatedAt: string;
  budgets?: ValidationBudget;
  cases: readonly ValidationCaseReport[];
  success: boolean;
}>;

export type CreateParamSetRequest = Readonly<{
  name: string;
  sourceSlug?: string;
}>;

export type SaveParamSetRequest = Readonly<{
  name: string;
  params: Readonly<Record<string, unknown>>;
  programState?: unknown;
}>;

export type PersistedParamSetRecord = PersistedParamSet;
