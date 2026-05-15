import {
  buildHeightMeshSamplePoints,
  createHeightMeshFile,
  createHeightMeshSamplerGcode,
  normalizeParams,
  parseHeightMeshFile,
  parseHeightMeshProbeLine,
  resolveProgramState,
  type HeightMeshProbeReading,
  type NormalizationIssue,
  type HeightMeshFile,
  type ParameterSchema,
  type ProgramDefinition,
} from "@ligneclaire/sdk";
import type {
  CreateParamSetRequest,
  DownloadGcodeRequest,
  DownloadSvgRequest,
  LoadedParamSet,
  ParamSetListResponse,
  PlotterDeviceSummary,
  ProgramDetails,
  ProgramListItem,
  RenderRequest,
  RenderResponse,
  SaveParamSetRequest,
  ToolDiagnostics,
} from "@ligneclaire/node-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { programRegistry } from "../../../../programs/generated/program-registry";
import { apiDownload, apiGet, apiSend } from "../api";
import { resolveGcodeRotationDeg } from "../lib/gcodeOrientation";
import {
  buildHeightMeshGridPreview,
  coalesceHeightMeshProbeReadings,
  estimateHeightMeshAckTimeoutMs,
  buildHeightMeshSamplerConfig,
  clampHeightMeshSettings,
  deriveDefaultHeightMeshSettings,
  downloadHeightMeshFile,
} from "../lib/heightMesh";
import {
  draftStorageKey,
  loadStudioSessionState,
  saveStudioSessionState,
  type StudioSessionState,
} from "../lib/studioPersistence";
import { defaultPlotterPenMotion } from "../lib/penMotion";
import { useGcodeTransport } from "./useGcodeTransport";
import type {
  CurrentDocumentState,
  ExportSettings,
  ExportKind,
  HeightMeshSettings,
  LocalProgram,
  StudioModel,
  StudioStatus,
} from "../types";

const localPrograms = new Map<string, ProgramDefinition<ParameterSchema, unknown>>(
  programRegistry.map((program) => [
    program.id,
    program as unknown as ProgramDefinition<ParameterSchema, unknown>,
  ])
);

const emptyParamSetList: ParamSetListResponse = {
  items: [],
  invalid: [],
};

const initialExportSettings: ExportSettings = {
  deviceId: "",
  rotationDeg: "auto",
  oversizeHandling: "ignore",
  penMotion: defaultPlotterPenMotion(null),
};

function snapshotValue(value: unknown): string {
  return JSON.stringify(value);
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function splitGcodeJobLines(content: string | undefined): readonly string[] {
  if (!content) {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(";"));
}

function createDefaultDocument(
  details: ProgramDetails,
  localProgram: LocalProgram | undefined
): CurrentDocumentState {
  const normalized = normalizeParams(details.params, {});

  return {
    slug: "default",
    name: "Untitled",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    params: normalized.params as Readonly<Record<string, number | boolean>>,
    programState: localProgram
      ? resolveProgramState(localProgram, normalized.params, undefined)
      : undefined,
  };
}

function toCurrentDocument(slug: string, loaded: LoadedParamSet): CurrentDocumentState {
  return {
    slug,
    name: loaded.name,
    createdAt: loaded.createdAt,
    updatedAt: loaded.updatedAt,
    params: loaded.params as Readonly<Record<string, number | boolean>>,
    programState: loaded.programState,
  };
}

function createUniqueName(
  baseName: string,
  items: readonly Readonly<{
    name: string;
  }>[]
): string {
  const existingNames = new Set(items.map((item) => item.name.toLowerCase()));
  let candidate = baseName;
  let counter = 2;

  while (existingNames.has(candidate.toLowerCase())) {
    candidate = `${baseName} ${counter}`;
    counter += 1;
  }

  return candidate;
}

function choosePreferredPlotterId(
  plotters: readonly PlotterDeviceSummary[],
  canvas: ProgramDetails["canvas"] | undefined,
  currentDeviceId: string
): string {
  if (plotters.length === 0) {
    return "";
  }

  if (canvas) {
    const exactMatch = plotters.find(
      (plotter) =>
        plotter.page.widthMm === canvas.widthMm &&
        plotter.page.heightMm === canvas.heightMm
    );
    if (exactMatch) {
      return exactMatch.id;
    }

    const rotatedMatch = plotters.find(
      (plotter) =>
        plotter.page.widthMm === canvas.heightMm &&
        plotter.page.heightMm === canvas.widthMm
    );
    if (rotatedMatch) {
      return rotatedMatch.id;
    }
  }

  if (currentDeviceId && plotters.some((plotter) => plotter.id === currentDeviceId)) {
    return currentDeviceId;
  }

  return plotters[0]!.id;
}

function nextExportSettingsForDevice(
  existing: ExportSettings,
  plotters: readonly PlotterDeviceSummary[],
  deviceId: string
): ExportSettings {
  if (deviceId === existing.deviceId) {
    return existing;
  }

  const plotter = plotters.find((candidate) => candidate.id === deviceId) ?? null;
  return {
    ...existing,
    deviceId,
    penMotion: defaultPlotterPenMotion(plotter),
  };
}

function createDownloadName(
  programId: string,
  slug: string,
  suffix: string
): string {
  return `${programId}-${slug}${suffix}`;
}

function selectRenderProgramState(
  localProgram: LocalProgram | undefined,
  programState: unknown
): unknown {
  if (!localProgram?.selectRenderProgramState) {
    return programState;
  }

  try {
    return localProgram.selectRenderProgramState(programState);
  } catch (error) {
    console.error(
      `Failed to derive render state for program "${localProgram.id}". Falling back to full program state.`,
      error
    );
    return programState;
  }
}

export function useStudioData(): StudioModel {
  const persistenceRef = useRef(loadStudioSessionState());
  const [programs, setPrograms] = useState<readonly ProgramListItem[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState(
    () => persistenceRef.current.selectedProgramId
  );
  const [programDetails, setProgramDetails] = useState<ProgramDetails | null>(null);
  const [paramSetList, setParamSetList] = useState<ParamSetListResponse>(emptyParamSetList);
  const [current, setCurrent] = useState<CurrentDocumentState | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [svg, setSvg] = useState("");
  const [metrics, setMetrics] = useState<RenderResponse["metrics"] | null>(null);
  const [validationIssues, setValidationIssues] = useState<RenderResponse["validationIssues"]>([]);
  const [normalizationIssues, setNormalizationIssues] = useState<RenderResponse["normalizationIssues"]>([]);
  const [tools, setTools] = useState<ToolDiagnostics | null>(null);
  const [plotters, setPlotters] = useState<readonly PlotterDeviceSummary[]>([]);
  const [showDebug, setShowDebug] = useState(true);
  const [showEditor, setShowEditor] = useState(true);
  const [status, setStatus] = useState<StudioStatus>({
    tone: "neutral",
    message: "Loading studio...",
  });
  const [editorComponent, setEditorComponent] = useState<StudioModel["editorComponent"]>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [pendingExport, setPendingExport] = useState<ExportKind | null>(null);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(
    () => persistenceRef.current.exportSettings ?? initialExportSettings
  );
  const [heightMeshSettings, setHeightMeshSettings] = useState<HeightMeshSettings>(
    () => deriveDefaultHeightMeshSettings(null)
  );
  const [heightMesh, setHeightMesh] = useState<HeightMeshFile | null>(null);
  const [heightMeshStatus, setHeightMeshStatus] = useState<StudioModel["heightMesh"]["status"]>({
    state: "idle",
    totalSamples: 0,
    capturedSamples: 0,
    errorMessage: null,
  });

  const localProgram = useMemo(
    () => (selectedProgramId ? localPrograms.get(selectedProgramId) : undefined),
    [selectedProgramId]
  );
  const selectedPlotter = useMemo(
    () => plotters.find((plotter) => plotter.id === exportSettings.deviceId) ?? null,
    [exportSettings.deviceId, plotters]
  );
  const resolvedExportRotationDeg = useMemo(
    () =>
      resolveGcodeRotationDeg(
        exportSettings.rotationDeg,
        programDetails?.canvas,
        selectedPlotter
      ),
    [exportSettings.rotationDeg, programDetails?.canvas, selectedPlotter]
  );
  const activeHeightMeshSamplerConfig = useMemo(
    () => buildHeightMeshSamplerConfig(selectedPlotter, heightMeshSettings),
    [heightMeshSettings, selectedPlotter]
  );
  const heightMeshGrid = useMemo(
    () => buildHeightMeshGridPreview(selectedPlotter, heightMeshSettings),
    [heightMeshSettings, selectedPlotter]
  );
  const heightMeshDeviceMismatch = useMemo(
    () => (heightMesh ? heightMesh.plotter.id !== exportSettings.deviceId : false),
    [exportSettings.deviceId, heightMesh]
  );
  const dirty = current ? snapshotValue(current) !== savedSnapshot : false;
  const previewProgramState = useMemo(
    () =>
      current
        ? selectRenderProgramState(localProgram, current.programState)
        : undefined,
    [current?.programState, localProgram]
  );
  const previewRequestSnapshot = useMemo(
    () =>
      current && selectedProgramId
        ? snapshotValue({
            params: current.params,
            programState: previewProgramState,
            showDebug,
          })
        : "",
    [current?.params, previewProgramState, selectedProgramId, showDebug]
  );
  const transport = useGcodeTransport({
    current,
    deviceId: exportSettings.deviceId,
    heightMesh,
    oversizeHandling: exportSettings.oversizeHandling,
    penMotion: exportSettings.penMotion,
    plotters,
    rotationDeg: resolvedExportRotationDeg,
    selectedProgramId,
    setStatus,
  });

  function persistSession(
    updater: (currentSession: StudioSessionState) => StudioSessionState
  ): void {
    persistenceRef.current = saveStudioSessionState(updater(persistenceRef.current));
  }

  function restoreDocumentState(
    programId: string,
    nextDocument: CurrentDocumentState,
    nextNormalizationIssues: readonly NormalizationIssue[]
  ): boolean {
    const draft = persistenceRef.current.drafts[draftStorageKey(programId, nextDocument.slug)];
    setCurrent(draft?.current ?? nextDocument);
    setSavedSnapshot(draft?.savedSnapshot ?? snapshotValue(nextDocument));
    setNormalizationIssues(nextNormalizationIssues);
    return Boolean(draft);
  }

  function clearStoredDraft(programId: string, slug: string): void {
    const key = draftStorageKey(programId, slug);
    if (!(key in persistenceRef.current.drafts)) {
      return;
    }

    persistSession((currentSession) => {
      const nextDrafts = { ...currentSession.drafts };
      delete nextDrafts[key];
      return {
        ...currentSession,
        drafts: nextDrafts,
      };
    });
  }

  function applyLoadedParamSet(
    programId: string,
    slug: string,
    loaded: LoadedParamSet
  ): boolean {
    const next = toCurrentDocument(slug, loaded);
    return restoreDocumentState(programId, next, loaded.normalizationIssues);
  }

  async function refreshParamSets(selectSlug?: string): Promise<void> {
    if (!selectedProgramId) {
      return;
    }

    const response = await apiGet<ParamSetListResponse>(`/api/programs/${selectedProgramId}/params`);
    setParamSetList(response);

    if (selectSlug) {
      const loaded = await apiGet<LoadedParamSet>(
        `/api/programs/${selectedProgramId}/params/${selectSlug}`
      );
      applyLoadedParamSet(selectedProgramId, selectSlug, loaded);
    }
  }

  async function selectParamSet(slug: string): Promise<void> {
    if (!selectedProgramId || !slug) {
      return;
    }

    try {
      const loaded = await apiGet<LoadedParamSet>(`/api/programs/${selectedProgramId}/params/${slug}`);
      const restoredDraft = applyLoadedParamSet(selectedProgramId, slug, loaded);
      setStatus({
        tone: "neutral",
        message: restoredDraft
          ? `Restored unsaved changes for "${loaded.name}".`
          : `Loaded parameter set "${loaded.name}".`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: formatError(error, "Failed to load parameter set."),
      });
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const [programList, toolStatus, plotterList] = await Promise.all([
          apiGet<readonly ProgramListItem[]>("/api/programs", controller.signal),
          apiGet<ToolDiagnostics>("/api/system/tools", controller.signal),
          apiGet<readonly PlotterDeviceSummary[]>("/api/plotters", controller.signal),
        ]);

        setPrograms(programList);
        setTools(toolStatus);
        setPlotters(plotterList);
        setStatus({
          tone: "success",
          message: "Studio ready.",
        });

        if (programList.length > 0) {
          const defaultProgramId =
            programList.find((program) => program.id !== "node-composer")?.id ??
            programList[0]!.id;
          setSelectedProgramId((existing) =>
            programList.some((program) => program.id === existing)
              ? existing
              : defaultProgramId
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setStatus({
            tone: "error",
            message: formatError(error, "Failed to load studio."),
          });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!selectedProgramId) {
      return;
    }

    const controller = new AbortController();
    const nextLocalProgram = localPrograms.get(selectedProgramId);
    setProgramDetails(null);
    setParamSetList(emptyParamSetList);
    setCurrent(null);
    setSvg("");
    setMetrics(null);
    setValidationIssues([]);
    setNormalizationIssues([]);
    setStatus({
      tone: "neutral",
      message: "Loading program...",
    });

    void (async () => {
      try {
        const [details, paramsResponse] = await Promise.all([
          apiGet<ProgramDetails>(`/api/programs/${selectedProgramId}`, controller.signal),
          apiGet<ParamSetListResponse>(
            `/api/programs/${selectedProgramId}/params`,
            controller.signal
          ),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        setProgramDetails(details);
        setParamSetList(paramsResponse);

        const storedSlug =
          persistenceRef.current.selectedParamSetByProgram[selectedProgramId];
        const preferredSlug =
          paramsResponse.items.find((item) => item.slug === storedSlug)?.slug ??
          paramsResponse.items.find((item) => item.slug === "default")?.slug ??
          paramsResponse.items[0]?.slug;

        if (preferredSlug) {
          const loaded = await apiGet<LoadedParamSet>(
            `/api/programs/${selectedProgramId}/params/${preferredSlug}`,
            controller.signal
          );
          if (controller.signal.aborted) {
            return;
          }

          const restoredDraft = applyLoadedParamSet(
            selectedProgramId,
            preferredSlug,
            loaded
          );
          setStatus({
            tone: "neutral",
            message: restoredDraft
              ? `Restored unsaved changes for "${loaded.name}".`
              : `Editing ${details.title}.`,
          });
        } else {
          const fallback = createDefaultDocument(details, nextLocalProgram);
          const restoredDraft = restoreDocumentState(selectedProgramId, fallback, []);
          setStatus({
            tone: "neutral",
            message: restoredDraft
              ? `Restored unsaved changes for "${fallback.name}".`
              : `Editing ${details.title}.`,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setStatus({
            tone: "error",
            message: formatError(error, "Failed to load program."),
          });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [selectedProgramId]);

  useEffect(() => {
    if (!localProgram?.editor) {
      setEditorComponent(null);
      return;
    }

    let cancelled = false;

    void localProgram.editor
      .load()
      .then((module) => {
        if (!cancelled) {
          setEditorComponent(() => module.default);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setEditorComponent(null);
          setStatus({
            tone: "error",
            message: formatError(error, "Failed to load custom editor."),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [localProgram]);

  useEffect(() => {
    if (!current || !selectedProgramId) {
      return;
    }

    const controller = new AbortController();
    setIsRendering(true);

    void apiSend<RenderRequest, RenderResponse>(
      "/api/render",
      "POST",
      {
        programId: selectedProgramId,
        params: current.params,
        programState: previewProgramState,
        showDebug,
        mode: "preview",
      },
      controller.signal
    )
      .then((response) => {
        setSvg(response.svg);
        setMetrics(response.metrics);
        setValidationIssues(response.validationIssues);
        setNormalizationIssues(response.normalizationIssues);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setStatus({
            tone: "error",
            message: formatError(error, "Preview failed."),
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsRendering(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [previewRequestSnapshot, selectedProgramId]);

  useEffect(() => {
    setExportSettings((existing) => {
      const nextDeviceId = choosePreferredPlotterId(
        plotters,
        programDetails?.canvas,
        existing.deviceId
      );
      return nextExportSettingsForDevice(existing, plotters, nextDeviceId);
    });
  }, [
    plotters,
    programDetails?.canvas.widthMm,
    programDetails?.canvas.heightMm,
    programDetails?.canvas.marginMm,
  ]);

  useEffect(() => {
    setHeightMeshSettings((existing) =>
      selectedPlotter
        ? clampHeightMeshSettings(selectedPlotter, deriveDefaultHeightMeshSettings(selectedPlotter))
        : existing
    );
    setHeightMeshStatus(
      heightMesh
        ? {
            state: "complete",
            totalSamples: heightMesh.samples.length,
            capturedSamples: heightMesh.samples.length,
            errorMessage: null,
          }
        : {
            state: "idle",
            totalSamples: 0,
            capturedSamples: 0,
            errorMessage: null,
          }
    );
  }, [selectedPlotter?.id]);

  useEffect(() => {
    if (!selectedProgramId) {
      return;
    }

    persistSession((currentSession) =>
      currentSession.selectedProgramId === selectedProgramId
        ? currentSession
        : {
            ...currentSession,
            selectedProgramId,
          }
    );
  }, [selectedProgramId]);

  useEffect(() => {
    persistSession((currentSession) => ({
      ...currentSession,
      exportSettings,
    }));
  }, [exportSettings]);

  useEffect(() => {
    if (!selectedProgramId || !current) {
      return;
    }

    persistSession((currentSession) => ({
      ...currentSession,
      selectedParamSetByProgram: {
        ...currentSession.selectedParamSetByProgram,
        [selectedProgramId]: current.slug,
      },
    }));
  }, [current?.slug, selectedProgramId]);

  useEffect(() => {
    if (!selectedProgramId || !current) {
      return;
    }

    const key = draftStorageKey(selectedProgramId, current.slug);
    if (snapshotValue(current) === savedSnapshot) {
      if (key in persistenceRef.current.drafts) {
        clearStoredDraft(selectedProgramId, current.slug);
      }
      return;
    }

    const timeoutId = window.setTimeout(() => {
      persistSession((currentSession) => ({
        ...currentSession,
        drafts: {
          ...currentSession.drafts,
          [key]: {
            current,
            savedSnapshot,
          },
        },
      }));
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [current, savedSnapshot, selectedProgramId]);

  function setCurrentName(name: string): void {
    setCurrent((existing) =>
      existing
        ? {
            ...existing,
            name,
          }
        : existing
    );
  }

  function updateParam(key: string, value: number | boolean): void {
    setCurrent((existing) =>
      existing
        ? {
            ...existing,
            params: {
              ...existing.params,
              [key]: value,
            },
          }
        : existing
    );
  }

  function updateProgramState(updater: (current: unknown) => unknown): void {
    setCurrent((existing) =>
      existing
        ? {
            ...existing,
            programState: updater(existing.programState),
          }
        : existing
    );
  }

  function setExportDeviceId(deviceId: string): void {
    setExportSettings((existing) =>
      nextExportSettingsForDevice(existing, plotters, deviceId)
    );
  }

  function setHeightMeshPlotterId(plotterId: string): void {
    setExportDeviceId(plotterId);
  }

  function setExportRotationDeg(rotationDeg: ExportSettings["rotationDeg"]): void {
    setExportSettings((existing) => ({
      ...existing,
      rotationDeg,
    }));
  }

  function setExportOversizeHandling(
    oversizeHandling: ExportSettings["oversizeHandling"]
  ): void {
    setExportSettings((existing) => ({
      ...existing,
      oversizeHandling,
    }));
  }

  function setExportPenMotion(penMotion: ExportSettings["penMotion"]): void {
    setExportSettings((existing) => ({
      ...existing,
      penMotion,
    }));
  }

  function updateHeightMeshSettings(patch: Partial<HeightMeshSettings>): void {
    setHeightMeshSettings((existing) =>
      selectedPlotter
        ? clampHeightMeshSettings(selectedPlotter, {
            ...existing,
            ...patch,
          })
        : {
            ...existing,
            ...patch,
          }
    );
  }

  function clearHeightMesh(): void {
    setHeightMesh(null);
    setHeightMeshStatus({
      state: "idle",
      totalSamples: 0,
      capturedSamples: 0,
      errorMessage: null,
    });
    setStatus({
      tone: "neutral",
      message: "Height mesh cleared.",
    });
  }

  function downloadHeightMesh(): void {
    if (!heightMesh) {
      return;
    }

    downloadHeightMeshFile(heightMesh);
    setStatus({
      tone: "success",
      message: "Height mesh JSON downloaded.",
    });
  }

  async function importHeightMeshFile(file: File): Promise<void> {
    try {
      const parsed = parseHeightMeshFile(JSON.parse(await file.text()));
      if (!parsed) {
        throw new Error("File is not a valid LigneClaire height mesh JSON.");
      }

      setHeightMesh(parsed);
      setHeightMeshStatus({
        state: "complete",
        totalSamples: parsed.samples.length,
        capturedSamples: parsed.samples.length,
        errorMessage: null,
      });
      setStatus({
        tone: "success",
        message: `Loaded height mesh from ${file.name}.`,
      });
    } catch (error) {
      const message = formatError(error, "Failed to import height mesh JSON.");
      setHeightMeshStatus({
        state: "failed",
        totalSamples: 0,
        capturedSamples: 0,
        errorMessage: message,
      });
      setStatus({
        tone: "error",
        message,
      });
    }
  }

  async function sampleHeightMesh(): Promise<void> {
    if (!selectedPlotter?.gcode || !activeHeightMeshSamplerConfig) {
      setStatus({
        tone: "error",
        message: "Selected plotter does not define height mesh sampling defaults.",
      });
      return;
    }

    const expectedPoints = buildHeightMeshSamplePoints(
      selectedPlotter.page,
      activeHeightMeshSamplerConfig
    );
    const readings: HeightMeshProbeReading[] = [];
    let activeProbeCommand: "sample" | "release" | null = null;
    const samplingAckTimeoutMs = estimateHeightMeshAckTimeoutMs(
      selectedPlotter,
      activeHeightMeshSamplerConfig,
      transport.settings.ackTimeoutMs
    );
    const lines = [
      ...splitGcodeJobLines(selectedPlotter.gcode.preambleCommand),
      ...splitGcodeJobLines(
        createHeightMeshSamplerGcode(
          selectedPlotter.page,
          selectedPlotter.gcode.unit,
          activeHeightMeshSamplerConfig
        )
      ),
    ];

    setHeightMeshStatus({
      state: "sampling",
      totalSamples: expectedPoints.length,
      capturedSamples: 0,
      errorMessage: null,
    });

    try {
      if (transport.connectionState !== "connected") {
        await transport.connect();
      }

      await transport.runSerialJob({
        label: "Height mesh sampling",
        ackTimeoutMs: samplingAckTimeoutMs,
        lines,
        onSendLine: (line) => {
          const normalizedLine = line.trim().toUpperCase();
          if (/\bG38\.2\b/.test(normalizedLine)) {
            activeProbeCommand = "sample";
            return;
          }

          if (/\bG38\.4\b/.test(normalizedLine)) {
            activeProbeCommand = "release";
            return;
          }
        },
        onResponseLine: (line) => {
          const reading = parseHeightMeshProbeLine(line);
          if (!reading) {
            return;
          }

          if (activeProbeCommand !== "sample") {
            if (activeProbeCommand === "release") {
              activeProbeCommand = null;
            }
            return;
          }

          readings.push(reading);
          activeProbeCommand = null;
          setHeightMeshStatus((existing) => ({
            ...existing,
            capturedSamples: Math.min(expectedPoints.length, readings.length),
          }));
        },
      });

      const effectiveReadings = coalesceHeightMeshProbeReadings(
        readings,
        expectedPoints.length
      );

      if (effectiveReadings.length !== expectedPoints.length) {
        throw new Error(
          `Expected ${expectedPoints.length} probe readings but received ${effectiveReadings.length}.`
        );
      }

      const nextHeightMesh = createHeightMeshFile(
        selectedPlotter.page,
        activeHeightMeshSamplerConfig,
        effectiveReadings,
        {
          plotterId: selectedPlotter.id,
          plotterLabel: selectedPlotter.label,
        }
      );

      setHeightMesh(nextHeightMesh);
      setHeightMeshStatus({
        state: "complete",
        totalSamples: expectedPoints.length,
        capturedSamples: expectedPoints.length,
        errorMessage: null,
      });
      setStatus({
        tone: "success",
        message: `Sampled ${expectedPoints.length} height points.`,
      });
    } catch (error) {
      const message = formatError(error, "Height mesh sampling failed.");
      setHeightMeshStatus({
        state: "failed",
        totalSamples: expectedPoints.length,
        capturedSamples: readings.length,
        errorMessage: message,
      });
      setStatus({
        tone: "error",
        message,
      });
    }
  }

  async function saveCurrent(): Promise<void> {
    if (!selectedProgramId || !current) {
      return;
    }

    try {
      let targetSlug = current.slug;
      const existsOnDisk = paramSetList.items.some((item) => item.slug === current.slug);

      if (!existsOnDisk) {
        const created = await apiSend<CreateParamSetRequest, LoadedParamSet>(
          `/api/programs/${selectedProgramId}/params`,
          "POST",
          {
            name: current.name,
          }
        );
        targetSlug = created.slug;
      }

      const saved = await apiSend<SaveParamSetRequest, LoadedParamSet>(
        `/api/programs/${selectedProgramId}/params/${targetSlug}`,
        "PUT",
        {
          name: current.name,
          params: current.params,
          programState: current.programState,
        }
      );

      clearStoredDraft(selectedProgramId, current.slug);
      clearStoredDraft(selectedProgramId, targetSlug);
      await refreshParamSets(saved.slug);
      setStatus({
        tone: "success",
        message: `Saved parameter set "${saved.name}".`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: formatError(error, "Failed to save parameter set."),
      });
    }
  }

  async function duplicateCurrent(): Promise<void> {
    if (!selectedProgramId || !current) {
      return;
    }

    try {
      const nextName = createUniqueName(`${current.name} Copy`, paramSetList.items);
      const created = await apiSend<CreateParamSetRequest, LoadedParamSet>(
        `/api/programs/${selectedProgramId}/params`,
        "POST",
        {
          name: nextName,
          sourceSlug: current.slug,
        }
      );

      await refreshParamSets(created.slug);
      setStatus({
        tone: "success",
        message: `Duplicated as "${created.name}".`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: formatError(error, "Failed to duplicate parameter set."),
      });
    }
  }

  async function createFromCurrent(): Promise<void> {
    if (!selectedProgramId || !current) {
      return;
    }

    try {
      const nextName = createUniqueName(current.name.trim() || "Untitled", paramSetList.items);
      const created = await apiSend<CreateParamSetRequest, LoadedParamSet>(
        `/api/programs/${selectedProgramId}/params`,
        "POST",
        {
          name: nextName,
          params: current.params,
          programState: current.programState,
        }
      );

      clearStoredDraft(selectedProgramId, current.slug);
      clearStoredDraft(selectedProgramId, created.slug);
      await refreshParamSets(created.slug);
      setStatus({
        tone: "success",
        message: `Created "${created.name}" from the current values.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: formatError(error, "Failed to create parameter set."),
      });
    }
  }

  function resetToDefaults(): void {
    if (!programDetails || !current) {
      return;
    }

    const schema = localProgram?.params ?? programDetails.params;
    const normalized = normalizeParams(schema, {});
    setCurrent({
      ...current,
      params: normalized.params as Readonly<Record<string, number | boolean>>,
      programState: localProgram
        ? resolveProgramState(localProgram, normalized.params, undefined)
        : undefined,
    });
    setNormalizationIssues(normalized.issues);
    setStatus({
      tone: "neutral",
      message: "Reset to program defaults. Save to persist the reset.",
    });
  }

  async function deleteCurrent(): Promise<void> {
    if (!selectedProgramId || !current) {
      return;
    }

    const canDelete = paramSetList.items.some((item) => item.slug === current.slug);
    if (!canDelete) {
      return;
    }

    if (!window.confirm(`Delete "${current.name}"?`)) {
      return;
    }

    try {
      await apiSend(`/api/programs/${selectedProgramId}/params/${current.slug}`, "DELETE");
      clearStoredDraft(selectedProgramId, current.slug);
      const response = await apiGet<ParamSetListResponse>(`/api/programs/${selectedProgramId}/params`);
      setParamSetList(response);

      const nextSlug = response.items[0]?.slug;
      if (nextSlug) {
        const loaded = await apiGet<LoadedParamSet>(
          `/api/programs/${selectedProgramId}/params/${nextSlug}`
        );
        applyLoadedParamSet(selectedProgramId, nextSlug, loaded);
      } else if (programDetails) {
        const fallback = createDefaultDocument(programDetails, localProgram);
        restoreDocumentState(selectedProgramId, fallback, []);
      } else {
        setCurrent(null);
        setSavedSnapshot("");
      }

      setStatus({
        tone: "success",
        message: `Deleted "${current.name}".`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: formatError(error, "Failed to delete parameter set."),
      });
    }
  }

  async function runExport(
    kind: ExportKind,
    request: DownloadSvgRequest | DownloadGcodeRequest,
    endpoint: "/api/export/svg" | "/api/export/gcode"
  ): Promise<void> {
    try {
      setPendingExport(kind);
      const response = await apiDownload(endpoint, request);
      setStatus({
        tone: "success",
        message: `Downloaded ${response.fileName}.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: formatError(error, "Export failed."),
      });
    } finally {
      setPendingExport(null);
    }
  }

  async function exportRawSvg(): Promise<void> {
    if (!selectedProgramId || !current) {
      return;
    }

    await runExport(
      "raw-svg",
      {
        programId: selectedProgramId,
        params: current.params,
        programState: current.programState,
        downloadName: createDownloadName(selectedProgramId, current.slug, ".svg"),
        optimized: false,
      },
      "/api/export/svg"
    );
  }

  async function exportOptimizedSvg(): Promise<void> {
    if (!selectedProgramId || !current) {
      return;
    }

    await runExport(
      "optimized-svg",
      {
        programId: selectedProgramId,
        params: current.params,
        programState: current.programState,
        downloadName: createDownloadName(selectedProgramId, current.slug, ".optimized.svg"),
        optimized: true,
      },
      "/api/export/svg"
    );
  }

  async function exportGcode(): Promise<void> {
    if (!selectedProgramId || !current || !exportSettings.deviceId) {
      return;
    }

    await runExport(
      "gcode",
      {
        programId: selectedProgramId,
        params: current.params,
        programState: current.programState,
        deviceId: exportSettings.deviceId,
        rotationDeg: resolvedExportRotationDeg,
        oversizeHandling: exportSettings.oversizeHandling,
        penMotion: exportSettings.penMotion,
        heightMesh: heightMesh ?? undefined,
        downloadName: createDownloadName(selectedProgramId, current.slug, ".gcode"),
      },
      "/api/export/gcode"
    );
  }

  return {
    programs,
    selectedProgramId,
    programDetails,
    paramSetList,
    current,
    dirty,
    svg,
    metrics,
    normalizationIssues,
    validationIssues,
    tools,
    plotters,
    status,
    showDebug,
    showEditor,
    isRendering,
    pendingExport,
    editorComponent,
    exportSettings,
    heightMesh: {
      activePlotterId: exportSettings.deviceId,
      activeSamplerConfig: activeHeightMeshSamplerConfig,
      deviceMismatch: heightMeshDeviceMismatch,
      grid: heightMeshGrid,
      mesh: heightMesh,
      settings: heightMeshSettings,
      status: heightMeshStatus,
      clear: clearHeightMesh,
      download: downloadHeightMesh,
      importFile: importHeightMeshFile,
      sample: sampleHeightMesh,
      setActivePlotterId: setHeightMeshPlotterId,
      updateSettings: updateHeightMeshSettings,
    },
    transport,
    localProgram,
    selectProgram: setSelectedProgramId,
    selectParamSet,
    setCurrentName,
    updateParam,
    updateProgramState,
    setShowDebug,
    setShowEditor,
    setExportDeviceId,
    setExportRotationDeg,
    setExportOversizeHandling,
    setExportPenMotion,
    saveCurrent,
    duplicateCurrent,
    createFromCurrent,
    resetToDefaults,
    deleteCurrent,
    exportRawSvg,
    exportOptimizedSvg,
    exportGcode,
  };
}
