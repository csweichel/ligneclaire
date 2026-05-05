import {
  normalizeParams,
  resolveProgramState,
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
import { useEffect, useMemo, useState } from "react";
import { programRegistry } from "../../../../programs/generated/program-registry";
import { apiDownload, apiGet, apiSend } from "../api";
import type {
  CurrentDocumentState,
  ExportSettings,
  ExportKind,
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
};

function snapshotValue(value: unknown): string {
  return JSON.stringify(value);
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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

function createDownloadName(
  programId: string,
  slug: string,
  suffix: string
): string {
  return `${programId}-${slug}${suffix}`;
}

export function useStudioData(): StudioModel {
  const [programs, setPrograms] = useState<readonly ProgramListItem[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState("");
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
  const [exportSettings, setExportSettings] = useState<ExportSettings>(initialExportSettings);

  const localProgram = useMemo(
    () => (selectedProgramId ? localPrograms.get(selectedProgramId) : undefined),
    [selectedProgramId]
  );
  const dirty = current ? snapshotValue(current) !== savedSnapshot : false;

  function applyLoadedParamSet(slug: string, loaded: LoadedParamSet): void {
    const next = toCurrentDocument(slug, loaded);
    setCurrent(next);
    setSavedSnapshot(snapshotValue(next));
    setNormalizationIssues(loaded.normalizationIssues);
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
      applyLoadedParamSet(selectSlug, loaded);
    }
  }

  async function selectParamSet(slug: string): Promise<void> {
    if (!selectedProgramId || !slug) {
      return;
    }

    try {
      const loaded = await apiGet<LoadedParamSet>(`/api/programs/${selectedProgramId}/params/${slug}`);
      applyLoadedParamSet(slug, loaded);
      setStatus({
        tone: "neutral",
        message: `Loaded parameter set "${loaded.name}".`,
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
          setSelectedProgramId((existing) => existing || programList[0]!.id);
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

        const preferredSlug =
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

          applyLoadedParamSet(preferredSlug, loaded);
        } else {
          const fallback = createDefaultDocument(details, nextLocalProgram);
          setCurrent(fallback);
          setSavedSnapshot(snapshotValue(fallback));
        }

        setStatus({
          tone: "neutral",
          message: `Editing ${details.title}.`,
        });
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
        programState: current.programState,
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
  }, [current, selectedProgramId, showDebug]);

  useEffect(() => {
    setExportSettings((existing) => {
      const nextDeviceId = choosePreferredPlotterId(
        plotters,
        programDetails?.canvas,
        existing.deviceId
      );
      if (nextDeviceId === existing.deviceId) {
        return existing;
      }

      return {
        ...existing,
        deviceId: nextDeviceId,
      };
    });
  }, [
    plotters,
    programDetails?.canvas.widthMm,
    programDetails?.canvas.heightMm,
    programDetails?.canvas.marginMm,
  ]);

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
    setExportSettings((existing) => ({
      ...existing,
      deviceId,
    }));
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

  async function createFromDefaults(): Promise<void> {
    if (!selectedProgramId) {
      return;
    }

    try {
      const nextName = createUniqueName("Untitled", paramSetList.items);
      const created = await apiSend<CreateParamSetRequest, LoadedParamSet>(
        `/api/programs/${selectedProgramId}/params`,
        "POST",
        { name: nextName }
      );

      await refreshParamSets(created.slug);
      setStatus({
        tone: "success",
        message: `Created "${created.name}".`,
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
      const response = await apiGet<ParamSetListResponse>(`/api/programs/${selectedProgramId}/params`);
      setParamSetList(response);

      const nextSlug = response.items[0]?.slug;
      if (nextSlug) {
        const loaded = await apiGet<LoadedParamSet>(
          `/api/programs/${selectedProgramId}/params/${nextSlug}`
        );
        applyLoadedParamSet(nextSlug, loaded);
      } else if (programDetails) {
        const fallback = createDefaultDocument(programDetails, localProgram);
        setCurrent(fallback);
        setSavedSnapshot(snapshotValue(fallback));
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
    localProgram,
    selectProgram: setSelectedProgramId,
    selectParamSet,
    setCurrentName,
    updateParam,
    updateProgramState,
    setShowDebug,
    setShowEditor,
    setExportDeviceId,
    saveCurrent,
    duplicateCurrent,
    createFromDefaults,
    resetToDefaults,
    deleteCurrent,
    exportRawSvg,
    exportOptimizedSvg,
    exportGcode,
  };
}
