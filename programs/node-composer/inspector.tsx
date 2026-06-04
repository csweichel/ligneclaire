import { clamp } from "@ligneclaire/sdk";
import {
  countImportedSvgOutlinePoints,
  emptyImportedSvgOutlineData,
  importSvgOutlineFile,
  normalizeImportedSvgOutlineData,
} from "@ligneclaire/ui";
import { useDeferredValue, useEffect, useRef, useState, type ChangeEvent, type JSX } from "react";
import {
  connectionForInput,
  nodeLabel,
  nodeSpec,
  programNodeHasProgramStateOverride,
  programNodeParamFields,
  programNodeParamSets,
  programNodeProgram,
  programNodeProgramId,
  programNodePrograms,
  programNodeProgramStateFieldKey,
  programNodeResolvedProgramState,
  type ComposerNode,
  type NodeComposerProgramState,
  type NodeConfigValue,
  type NodeFieldSpec,
} from "./model";
import { decodeSvgMaskData, loadSvgMaskFile, suggestSvgMaskSize } from "./svgMask";
import { googleTextFonts, isGoogleTextFontId } from "./text-fonts";

type NodeComposerInspectorProps = Readonly<{
  programState: NodeComposerProgramState;
  selectedNode: ComposerNode | null;
  onDisconnectInput: (nodeId: string, portId: string) => void;
  onPatchConfig: (nodeId: string, patch: Readonly<Record<string, NodeConfigValue>>) => void;
  onSelectProgram: (nodeId: string, programId: string) => void;
  onSelectParamSet: (nodeId: string, paramSetId: string) => void;
  onRemoveNode: (nodeId: string) => void;
}>;

type FieldRowProps = Readonly<{
  field: NodeFieldSpec;
  value: NodeConfigValue | undefined;
  onChange: (nextValue: NodeConfigValue) => void;
}>;

function FieldRow({ field, value, onChange }: FieldRowProps): JSX.Element {
  if (field.kind === "bool") {
    return (
      <label
        className="lc-editor-overlay__field"
        style={{
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "center",
        }}
      >
        <span className="lc-editor-overlay__label">{field.label}</span>
        <input
          checked={Boolean(value)}
          className="lc-parameter-toggle__checkbox"
          type="checkbox"
          onChange={(event) => {
            onChange(event.currentTarget.checked);
          }}
        />
      </label>
    );
  }

  if (field.kind === "choice") {
    return (
      <label className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">{field.label}</span>
        <select
          className="studio-input studio-input--compact"
          value={String(value ?? field.defaultValue)}
          onChange={(event) => {
            onChange(event.currentTarget.value);
          }}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === "text") {
    return (
      <label className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">{field.label}</span>
        <input
          className="studio-input studio-input--compact"
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          type="text"
          value={String(value ?? field.defaultValue)}
          onChange={(event) => {
            onChange(event.currentTarget.value);
          }}
        />
      </label>
    );
  }

  const numericValue = typeof value === "number" ? value : field.defaultValue;
  const step = field.step ?? (field.kind === "int" ? 1 : 0.01);

  return (
    <label className="lc-editor-overlay__field">
      <span className="lc-editor-overlay__label">
        {field.label}
        <span className="lc-editor-overlay__value">
          {numericValue.toFixed(field.kind === "int" ? 0 : 2)}
          {field.unit ? ` ${field.unit}` : ""}
        </span>
      </span>

      <div className="lc-parameter-field__controls">
        <input
          className="lc-editor-overlay__range"
          max={field.max}
          min={field.min}
          step={step}
          type="range"
          value={numericValue}
          onChange={(event) => {
            const nextValue = Number(event.currentTarget.value);
            onChange(
              field.kind === "int"
                ? Math.round(clamp(nextValue, field.min, field.max))
                : clamp(nextValue, field.min, field.max)
            );
          }}
        />
        <input
          className="lc-parameter-field__number"
          max={field.max}
          min={field.min}
          step={step}
          type="number"
          value={numericValue}
          onChange={(event) => {
            const nextValue = Number(event.currentTarget.value);
            if (Number.isNaN(nextValue)) {
              return;
            }

            onChange(
              field.kind === "int"
                ? Math.round(clamp(nextValue, field.min, field.max))
                : clamp(nextValue, field.min, field.max)
            );
          }}
        />
      </div>
    </label>
  );
}

type ProgramNodeFieldsProps = Readonly<{
  selectedNode: ComposerNode;
  onPatchConfig: (nodeId: string, patch: Readonly<Record<string, NodeConfigValue>>) => void;
  onSelectProgram: (nodeId: string, programId: string) => void;
  onSelectParamSet: (nodeId: string, paramSetId: string) => void;
}>;

type BasicNodeFieldsProps = Readonly<{
  selectedNode: ComposerNode;
  onPatchConfig: (nodeId: string, patch: Readonly<Record<string, NodeConfigValue>>) => void;
}>;

function BasicNodeFields({ selectedNode, onPatchConfig }: BasicNodeFieldsProps): JSX.Element {
  const spec = nodeSpec(selectedNode.kind);

  return (
    <div className="lc-node-composer__field-list">
      {spec.fields.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          value={selectedNode.config[field.key]}
          onChange={(nextValue) => {
            onPatchConfig(selectedNode.id, {
              [field.key]: nextValue,
            });
          }}
        />
      ))}
    </div>
  );
}

function OnaLogoContourFields({ selectedNode, onPatchConfig }: BasicNodeFieldsProps): JSX.Element {
  const outerContours =
    typeof selectedNode.config.contours === "number" ? selectedNode.config.contours : 14;
  const outerSpacing =
    typeof selectedNode.config.spacing === "number" ? selectedNode.config.spacing : 2;

  return (
    <>
      <BasicNodeFields selectedNode={selectedNode} onPatchConfig={onPatchConfig} />
      <div className="lc-node-composer__asset-actions">
        <button
          className="studio-button studio-button--compact"
          type="button"
          onClick={() => {
            onPatchConfig(selectedNode.id, {
              innerContours: outerContours,
              innerSpacing: outerSpacing,
            });
          }}
        >
          Sync Inner
        </button>
      </div>
    </>
  );
}

const SVG_CONCENTRIC_OUTLINE_PROGRAM_ID = "svg-concentric-outline";

type SvgConcentricProgramStateFieldsProps = Readonly<{
  selectedNode: ComposerNode;
  onPatchConfig: (nodeId: string, patch: Readonly<Record<string, NodeConfigValue>>) => void;
}>;

function SvgConcentricProgramStateFields({
  selectedNode,
  onPatchConfig,
}: SvgConcentricProgramStateFieldsProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasOverride = programNodeHasProgramStateOverride(selectedNode.config);
  const selectedParamSetId = String(selectedNode.config.paramSetId ?? "");
  const currentState = normalizeImportedSvgOutlineData(
    programNodeResolvedProgramState(selectedNode.config)
  );
  const pointCount = countImportedSvgOutlinePoints(currentState);
  const resetLabel = selectedParamSetId ? "Reset to Parameter Set" : "Reset to Default";

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const imported = await importSvgOutlineFile(file);
      onPatchConfig(selectedNode.id, {
        [programNodeProgramStateFieldKey]: JSON.stringify(imported),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to import the selected SVG.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <label className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">SVG Source</span>

        <div className="lc-node-composer__asset-actions">
          <button
            className="studio-button studio-button--compact"
            type="button"
            disabled={loading}
            onClick={() => {
              inputRef.current?.click();
            }}
          >
            {loading ? "Loading..." : hasOverride ? "Replace SVG" : "Choose SVG"}
          </button>

          <button
            className="studio-button studio-button--compact"
            type="button"
            disabled={loading}
            onClick={() => {
              setError(null);
              onPatchConfig(selectedNode.id, {
                [programNodeProgramStateFieldKey]: JSON.stringify(emptyImportedSvgOutlineData()),
              });
            }}
          >
            Clear
          </button>

          {hasOverride ? (
            <button
              className="studio-button studio-button--compact"
              type="button"
              disabled={loading}
              onClick={() => {
                setError(null);
                onPatchConfig(selectedNode.id, {
                  [programNodeProgramStateFieldKey]: "",
                });
              }}
            >
              {resetLabel}
            </button>
          ) : null}

          <input
            ref={inputRef}
            accept=".svg,image/svg+xml"
            className="lc-node-composer__asset-input"
            type="file"
            onChange={(event) => {
              void handleFileChange(event);
            }}
          />
        </div>

        <span className="lc-node-composer__font-picker-current">
          {hasOverride
            ? "Using a node-specific imported SVG."
            : selectedParamSetId
              ? "Using the selected parameter set or embedded default SVG."
              : "Using the embedded program default SVG until you import one."}
        </span>
        {error ? (
          <span className="lc-node-composer__font-picker-error">{error}</span>
        ) : null}
      </label>

      <div className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">
          Source
          <span className="lc-editor-overlay__value">{currentState.sourceName || "None"}</span>
        </span>
      </div>

      <div className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">
          Imported paths
          <span className="lc-editor-overlay__value">
            {currentState.paths.length} paths / {pointCount} points
          </span>
        </span>
      </div>
    </>
  );
}

function ProgramNodeFields({
  selectedNode,
  onPatchConfig,
  onSelectProgram,
  onSelectParamSet,
}: ProgramNodeFieldsProps): JSX.Element {
  const programId = programNodeProgramId(selectedNode.config);
  const embeddedProgram = programNodeProgram(selectedNode.config);
  const paramSets = programNodeParamSets(programId);
  const paramFields = programNodeParamFields(selectedNode.config);
  const selectedParamSetId = String(selectedNode.config.paramSetId ?? "");

  return (
    <div className="lc-node-composer__field-list">
      <label className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">Program</span>
        <select
          className="studio-input studio-input--compact"
          value={programId}
          onChange={(event) => {
            onSelectProgram(selectedNode.id, event.currentTarget.value);
          }}
        >
          {programNodePrograms.map((program) => (
            <option key={program.id} value={program.id}>
              {program.title}
            </option>
          ))}
        </select>
      </label>

      <label className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">Parameter Set</span>
        <select
          className="studio-input studio-input--compact"
          value={selectedParamSetId}
          onChange={(event) => {
            onSelectParamSet(selectedNode.id, event.currentTarget.value);
          }}
        >
          <option value="">Current Params</option>
          {paramSets.map((paramSet) => (
            <option key={paramSet.slug} value={paramSet.slug}>
              {paramSet.name}
            </option>
          ))}
        </select>
      </label>

      {embeddedProgram ? (
        <p className="lc-editor-overlay__copy">{embeddedProgram.description}</p>
      ) : null}

      {programId === SVG_CONCENTRIC_OUTLINE_PROGRAM_ID ? (
        <SvgConcentricProgramStateFields
          selectedNode={selectedNode}
          onPatchConfig={onPatchConfig}
        />
      ) : null}

      {paramFields.length > 0 ? (
        paramFields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={selectedNode.config[field.key]}
            onChange={(nextValue) => {
              onPatchConfig(selectedNode.id, {
                [field.key]: nextValue,
              });
            }}
          />
        ))
      ) : (
        <p className="lc-editor-overlay__copy">
          This program is configured by its selected parameter set or built-in default state.
        </p>
      )}
    </div>
  );
}

type GoogleFontSearchItem = Readonly<{
  family: string;
  category: string;
  availableWeights: readonly number[];
}>;

type GoogleFontSearchResponse = Readonly<{
  items: readonly GoogleFontSearchItem[];
}>;

type GoogleFontResolveResponse = Readonly<{
  family: string;
  resolvedWeight: number;
  fontDataBase64: string;
  fontCacheKey: string;
}>;

const legacyGoogleFontFamilyById = new Map<string, string>(
  googleTextFonts.map((font) => [font.id, font.label] as const)
);

function fontFamilyLabel(fontId: string): string {
  return legacyGoogleFontFamilyById.get(fontId) ?? fontId;
}

function fontWeightSummary(weights: readonly number[]): string {
  if (weights.length === 0) {
    return "Default";
  }

  if (weights.length === 1) {
    return `${weights[0]}`;
  }

  return `${weights[0]}-${weights[weights.length - 1]}`;
}

async function fetchJson<Response>(url: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(url, signal ? { signal } : undefined);
  const text = await response.text();
  const payload = text.length > 0 ? (JSON.parse(text) as Response & { message?: string }) : ({} as Response);

  if (!response.ok) {
    throw new Error((payload as { message?: string }).message ?? `Request failed with ${response.status}`);
  }

  return payload;
}

type TextNodeFieldsProps = Readonly<{
  selectedNode: ComposerNode;
  onPatchConfig: (nodeId: string, patch: Readonly<Record<string, NodeConfigValue>>) => void;
}>;

function TextNodeFields({ selectedNode, onPatchConfig }: TextNodeFieldsProps): JSX.Element {
  const textSpec = nodeSpec("text");
  const rawFontId = String(selectedNode.config.fontId ?? "inter").trim();
  const currentFontFamily = fontFamilyLabel(rawFontId || "inter");
  const fontWeight = typeof selectedNode.config.fontWeight === "number" ? selectedNode.config.fontWeight : 400;
  const [searchQuery, setSearchQuery] = useState(currentFontFamily);
  const deferredWeight = useDeferredValue(fontWeight);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [results, setResults] = useState<readonly GoogleFontSearchItem[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const resolveGenerationRef = useRef(0);

  useEffect(() => {
    setSearchQuery(currentFontFamily);
    setResolveError(null);
  }, [currentFontFamily, selectedNode.id]);

  useEffect(() => {
    const controller = new AbortController();
    const searchValue = deferredSearchQuery.trim();

    setSearchLoading(true);
    setSearchError(null);

    void fetchJson<GoogleFontSearchResponse>(
      `/api/google-fonts/search?q=${encodeURIComponent(searchValue)}&limit=24`,
      controller.signal
    )
      .then((payload) => {
        setResults(payload.items);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setSearchError(error instanceof Error ? error.message : "Failed to search Google Fonts.");
        setResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [deferredSearchQuery, selectedNode.id]);

  async function resolveAndApplyFont(family: string, weight: number): Promise<void> {
    const generation = resolveGenerationRef.current + 1;
    resolveGenerationRef.current = generation;
    setResolveError(null);

    try {
      const payload = await fetchJson<GoogleFontResolveResponse>(
        `/api/google-fonts/resolve?family=${encodeURIComponent(family)}&weight=${weight}`
      );

      if (resolveGenerationRef.current !== generation) {
        return;
      }

      onPatchConfig(selectedNode.id, {
        fontId: payload.family,
        fontCacheKey: payload.fontCacheKey,
        fontDataBase64: payload.fontDataBase64,
        fontResolvedWeight: payload.resolvedWeight,
        fontRequestedWeight: weight,
      });
      setSearchQuery(payload.family);
      setDropdownOpen(false);
    } catch (error) {
      if (resolveGenerationRef.current !== generation) {
        return;
      }

      setResolveError(error instanceof Error ? error.message : "Failed to load Google font.");
    }
  }

  useEffect(() => {
    const hasExternalFontData = String(selectedNode.config.fontDataBase64 ?? "").length > 0;
    const requestedWeight = typeof selectedNode.config.fontRequestedWeight === "number"
      ? selectedNode.config.fontRequestedWeight
      : 0;

    if (!hasExternalFontData && isGoogleTextFontId(rawFontId)) {
      return;
    }

    if (hasExternalFontData && requestedWeight === deferredWeight) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void resolveAndApplyFont(currentFontFamily, deferredWeight);
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    currentFontFamily,
    deferredWeight,
    rawFontId,
    selectedNode.config.fontDataBase64,
    selectedNode.config.fontRequestedWeight,
    selectedNode.id,
  ]);

  return (
    <div className="lc-node-composer__field-list">
      {textSpec.fields.map((field) => {
        if (field.key === "fontId") {
          return (
            <label key={field.key} className="lc-editor-overlay__field">
              <span className="lc-editor-overlay__label">Font</span>
              <div
                className="lc-node-composer__font-picker"
                onBlur={() => {
                  window.setTimeout(() => {
                    setDropdownOpen(false);
                  }, 100);
                }}
              >
                <input
                  className="studio-input studio-input--compact"
                  placeholder="Type to search Google Fonts"
                  type="text"
                  value={searchQuery}
                  role="combobox"
                  aria-expanded={dropdownOpen}
                  aria-controls={`text-font-results-${selectedNode.id}`}
                  onFocus={() => {
                    setDropdownOpen(true);
                  }}
                  onChange={(event) => {
                    setSearchQuery(event.currentTarget.value);
                    setDropdownOpen(true);
                  }}
                />

                {dropdownOpen ? (
                  <div
                    id={`text-font-results-${selectedNode.id}`}
                    role="listbox"
                    className="lc-node-composer__font-picker-panel"
                  >
                    {searchLoading ? (
                      <div className="lc-node-composer__font-picker-status">Searching Google Fonts…</div>
                    ) : null}
                    {!searchLoading && searchError ? (
                      <div className="lc-node-composer__font-picker-status">{searchError}</div>
                    ) : null}
                    {!searchLoading && !searchError && results.length === 0 ? (
                      <div className="lc-node-composer__font-picker-status">No fonts found.</div>
                    ) : null}
                    {!searchLoading && !searchError
                      ? results.map((item) => (
                          <button
                            key={item.family}
                            className="lc-node-composer__font-picker-option"
                            type="button"
                            role="option"
                            aria-selected={item.family === currentFontFamily}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              void resolveAndApplyFont(item.family, fontWeight);
                            }}
                          >
                            <span className="lc-node-composer__font-picker-family">{item.family}</span>
                            <span className="lc-node-composer__font-picker-meta">
                              {item.category} · {fontWeightSummary(item.availableWeights)}
                            </span>
                          </button>
                        ))
                      : null}
                  </div>
                ) : null}
              </div>

              <span className="lc-node-composer__font-picker-current">
                Current: {currentFontFamily}
                {typeof selectedNode.config.fontResolvedWeight === "number"
                  ? ` · rendered at ${selectedNode.config.fontResolvedWeight}`
                  : ""}
              </span>
              {resolveError ? (
                <span className="lc-node-composer__font-picker-error">{resolveError}</span>
              ) : null}
            </label>
          );
        }

        const value = selectedNode.config[field.key];
        return (
          <FieldRow
            key={field.key}
            field={field}
            value={value}
            onChange={(nextValue) => {
              onPatchConfig(selectedNode.id, {
                [field.key]: nextValue,
              });
            }}
          />
        );
      })}
    </div>
  );
}

type SvgMaskNodeFieldsProps = Readonly<{
  selectedNode: ComposerNode;
  onPatchConfig: (nodeId: string, patch: Readonly<Record<string, NodeConfigValue>>) => void;
}>;

function SvgMaskNodeFields({ selectedNode, onPatchConfig }: SvgMaskNodeFieldsProps): JSX.Element {
  const maskSpec = nodeSpec("mask-svg");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedMask = decodeSvgMaskData(String(selectedNode.config.svgMaskDataBase64 ?? ""));
  const sourceName = String(selectedNode.config.svgMaskSourceName ?? "").trim();
  const hasMaskData = loadedMask !== null;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const loaded = await loadSvgMaskFile(file);
      const nextPatch: Record<string, NodeConfigValue> = {
        svgMaskDataBase64: loaded.encoded,
        svgMaskSourceName: loaded.sourceName,
      };

      if (!hasMaskData) {
        const suggestedSize = suggestSvgMaskSize(loaded.data);
        nextPatch.width = suggestedSize.width;
        nextPatch.height = suggestedSize.height;
      }

      onPatchConfig(selectedNode.id, nextPatch);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to import the selected SVG.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lc-node-composer__field-list">
      <label className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">SVG Source</span>

        <div className="lc-node-composer__asset-actions">
          <button
            className="studio-button studio-button--compact"
            type="button"
            disabled={loading}
            onClick={() => {
              inputRef.current?.click();
            }}
          >
            {loading ? "Loading..." : hasMaskData ? "Replace SVG" : "Choose SVG"}
          </button>

          {hasMaskData ? (
            <button
              className="studio-button studio-button--compact"
              type="button"
              disabled={loading}
              onClick={() => {
                setError(null);
                onPatchConfig(selectedNode.id, {
                  svgMaskDataBase64: "",
                  svgMaskSourceName: "",
                });
              }}
            >
              Clear
            </button>
          ) : null}

          <input
            ref={inputRef}
            accept=".svg,image/svg+xml"
            className="lc-node-composer__asset-input"
            type="file"
            onChange={(event) => {
              void handleFileChange(event);
            }}
          />
        </div>

        <span className="lc-node-composer__font-picker-current">
          {hasMaskData
            ? `Loaded: ${sourceName || "SVG mask"} (${loadedMask.columns} x ${loadedMask.rows} samples)`
            : "No SVG mask loaded yet."}
        </span>
        {error ? (
          <span className="lc-node-composer__font-picker-error">{error}</span>
        ) : null}
      </label>

      {maskSpec.fields.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          value={selectedNode.config[field.key]}
          onChange={(nextValue) => {
            onPatchConfig(selectedNode.id, {
              [field.key]: nextValue,
            });
          }}
        />
      ))}
    </div>
  );
}

export function NodeComposerInspector({
  programState,
  selectedNode,
  onDisconnectInput,
  onPatchConfig,
  onSelectProgram,
  onSelectParamSet,
  onRemoveNode,
}: NodeComposerInspectorProps): JSX.Element {
  if (!selectedNode) {
    return (
      <section className="lc-node-composer__section">
        <div className="lc-node-composer__section-header">
          <div>
            <p className="studio-eyebrow">Inspector</p>
            <h3 className="lc-editor-overlay__title">Selection</h3>
          </div>
        </div>

        <p className="lc-editor-overlay__copy">
          Select a node in the graph to edit its parameters and inspect its incoming wiring.
        </p>
      </section>
    );
  }

  const spec = nodeSpec(selectedNode.kind);

  return (
    <section className="lc-node-composer__section">
      <div className="lc-node-composer__section-header">
        <div>
          <p className="studio-eyebrow">Inspector</p>
          <h3 className="lc-editor-overlay__title">{nodeLabel(programState, selectedNode.id)}</h3>
        </div>
        <button
          className="studio-button studio-button--compact studio-button--danger"
          type="button"
          onClick={() => {
            onRemoveNode(selectedNode.id);
          }}
        >
          Remove
        </button>
      </div>

      <p className="lc-editor-overlay__copy">{spec.summary}</p>

      {spec.inputs.length > 0 ? (
        <div className="lc-node-composer__inspector-wiring">
          <span className="lc-editor-overlay__label">Inputs</span>
          {spec.inputs.map((input) => {
            const connection = connectionForInput(programState, selectedNode.id, input.id);
            const source = connection
              ? nodeLabel(programState, connection.from.nodeId)
              : "Unconnected";

            return (
              <div key={input.id} className="lc-node-composer__inspector-wiring-row">
                <div>
                  <div className="lc-node-composer__inspector-wiring-label">{input.label}</div>
                  <div className="lc-node-composer__inspector-wiring-value">{source}</div>
                </div>
                {connection ? (
                  <button
                    className="studio-button studio-button--compact"
                    type="button"
                    onClick={() => {
                      onDisconnectInput(selectedNode.id, input.id);
                    }}
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {selectedNode.kind === "program" ? (
        <ProgramNodeFields
          selectedNode={selectedNode}
          onPatchConfig={onPatchConfig}
          onSelectProgram={onSelectProgram}
          onSelectParamSet={onSelectParamSet}
        />
      ) : selectedNode.kind === "mask-svg" ? (
        <SvgMaskNodeFields
          selectedNode={selectedNode}
          onPatchConfig={onPatchConfig}
        />
      ) : selectedNode.kind === "text" ? (
        <TextNodeFields
          selectedNode={selectedNode}
          onPatchConfig={onPatchConfig}
        />
      ) : selectedNode.kind === "ona-logo-contours" ? (
        <OnaLogoContourFields
          selectedNode={selectedNode}
          onPatchConfig={onPatchConfig}
        />
      ) : spec.fields.length > 0 ? (
        <BasicNodeFields
          selectedNode={selectedNode}
          onPatchConfig={onPatchConfig}
        />
      ) : (
        <p className="lc-editor-overlay__copy">
          This node is driven entirely by its incoming connections.
        </p>
      )}
    </section>
  );
}
