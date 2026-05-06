import { clamp } from "@ligneclaire/sdk";
import type { JSX } from "react";
import {
  connectionForInput,
  nodeLabel,
  programNodeParamFields,
  programNodeParamSets,
  programNodeProgram,
  programNodeProgramId,
  programNodePrograms,
  nodeSpec,
  type ComposerNode,
  type NodeComposerProgramState,
  type NodeConfigValue,
  type NodeFieldSpec,
} from "./model";

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
      ) : spec.fields.length > 0 ? (
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
      ) : (
        <p className="lc-editor-overlay__copy">
          This node is driven entirely by its incoming connections.
        </p>
      )}
    </section>
  );
}
