import { ParameterInspector } from "@ligneclaire/ui";
import type { StudioModel } from "../../types";
import { DocumentActionBar } from "./DocumentActionBar";

type StudioSidebarProps = Readonly<{
  studio: StudioModel;
}>;

export function StudioSidebar({ studio }: StudioSidebarProps) {
  const savedParamSetSelected = Boolean(
    studio.current &&
      studio.paramSetList.items.some((item) => item.slug === studio.current?.slug)
  );
  const selectedParamSet = studio.paramSetList.items.find(
    (item) => item.slug === studio.current?.slug
  );
  const renamePending = Boolean(
    savedParamSetSelected &&
      studio.current &&
      selectedParamSet &&
      selectedParamSet.name !== studio.current.name.trim()
  );
  const nameMissing = Boolean(studio.current && studio.current.name.trim().length === 0);
  const saveDisabled = Boolean(
    !studio.current || nameMissing || (savedParamSetSelected && !studio.dirty)
  );
  const actionNote = nameMissing
    ? "Name is required before this parameter set can be saved."
    : !studio.current
      ? undefined
      : !savedParamSetSelected
        ? "Save to create a new parameter set from the current values."
        : renamePending
          ? "Saving will apply the new name to this parameter set."
          : studio.dirty
            ? "Unsaved changes."
            : undefined;

  return (
    <aside className="studio-sidebar">
      <div className="studio-sidebar__header">
        <label className="studio-field">
          <span className="studio-field__label">Program</span>
          <select
            className="studio-input"
            value={studio.selectedProgramId}
            onChange={(event) => {
              studio.selectProgram(event.currentTarget.value);
            }}
          >
            {studio.programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.title}
              </option>
            ))}
          </select>
        </label>

        <label className="studio-field">
          <span className="studio-field__label">Parameter set</span>
          <div className="studio-sidebar__set-row">
            <select
              className="studio-input"
              disabled={!studio.current && studio.paramSetList.items.length === 0}
              value={studio.current?.slug ?? ""}
              onChange={(event) => {
                void studio.selectParamSet(event.currentTarget.value);
              }}
            >
              {studio.paramSetList.items.length > 0 ? (
                studio.paramSetList.items.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))
              ) : (
                <option value={studio.current?.slug ?? ""}>Unsaved defaults</option>
              )}
            </select>

            <button
              className="studio-button"
              type="button"
              onClick={() => {
                void studio.createFromDefaults();
              }}
            >
              New
            </button>
          </div>
        </label>

        <label className="studio-field">
          <span className="studio-field__label">Name</span>
          <input
            className="studio-input"
            disabled={!studio.current}
            placeholder="Untitled"
            type="text"
            value={studio.current?.name ?? ""}
            onChange={(event) => {
              studio.setCurrentName(event.currentTarget.value);
            }}
          />
        </label>

        <DocumentActionBar
          deleteDisabled={!savedParamSetSelected}
          duplicateDisabled={!savedParamSetSelected}
          note={actionNote}
          onDelete={() => {
            void studio.deleteCurrent();
          }}
          onDuplicate={() => {
            void studio.duplicateCurrent();
          }}
          onReset={() => {
            studio.resetToDefaults();
          }}
          onSave={() => {
            void studio.saveCurrent();
          }}
          resetDisabled={!studio.current}
          saveDisabled={saveDisabled}
        />

        {studio.localProgram?.editor ? (
          <div className="studio-sidebar__notice">
            Interactive editor controls are available on the preview canvas.
          </div>
        ) : null}
      </div>

      <div className="studio-sidebar__body">
        <div className="studio-sidebar__section">
          {studio.programDetails && studio.current ? (
            <ParameterInspector
              schema={studio.programDetails.params}
              values={studio.current.params}
              onChange={studio.updateParam}
            />
          ) : (
            <div className="studio-empty-state">
              Load a program to inspect and adjust its generated controls.
            </div>
          )}
        </div>

        <details className="studio-sidebar__details" open>
          <summary>Status</summary>
          <div className="studio-sidebar__details-body">
            {studio.programDetails ? (
              <div className="studio-sidebar__meta-grid">
                <span>Canvas</span>
                <span>
                  {studio.programDetails.canvas.widthMm} x {studio.programDetails.canvas.heightMm} mm
                </span>
              </div>
            ) : null}

            {studio.paramSetList.invalid.length > 0 ? (
              <div className="studio-sidebar__issue">
                {studio.paramSetList.invalid.length} invalid parameter set
                {studio.paramSetList.invalid.length === 1 ? "" : "s"} ignored.
              </div>
            ) : null}

            {studio.normalizationIssues.length > 0 ? (
              <IssueBlock
                items={studio.normalizationIssues.map((issue) => issue.message)}
                title="Normalization"
              />
            ) : null}

            {studio.validationIssues.length > 0 ? (
              <IssueBlock
                items={studio.validationIssues.map(
                  (issue) => `${issue.severity.toUpperCase()}: ${issue.message}`
                )}
                title="Geometry"
              />
            ) : null}
          </div>
        </details>

        <details className="studio-sidebar__details">
          <summary>Metrics</summary>
          <div className="studio-sidebar__details-body">
            <MetricRow label="Art layers" value={String(studio.metrics?.artLayerCount ?? "--")} />
            <MetricRow label="Paths" value={String(studio.metrics?.pathCount ?? "--")} />
            <MetricRow label="Segments" value={String(studio.metrics?.segmentCount ?? "--")} />
            <MetricRow
              label="Draw distance"
              value={studio.metrics ? `${studio.metrics.drawDistanceMm.toFixed(1)} mm` : "--"}
            />
            <MetricRow
              label="Pen-up distance"
              value={studio.metrics ? `${studio.metrics.penUpDistanceMm.toFixed(1)} mm` : "--"}
            />
          </div>
        </details>

        <details className="studio-sidebar__details">
          <summary>Environment</summary>
          <div className="studio-sidebar__details-body">
            <MetricRow
              label="vpype"
              value={studio.tools?.vpype.available ? "Ready" : "Missing"}
            />
            <MetricRow
              label="vpype-gcode"
              value={studio.tools?.vpypeGcode.available ? "Ready" : "Missing"}
            />
          </div>
        </details>
      </div>
    </aside>
  );
}

type MetricRowProps = Readonly<{
  label: string;
  value: string;
}>;

function MetricRow({ label, value }: MetricRowProps) {
  return (
    <div className="studio-sidebar__meta-grid">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

type IssueBlockProps = Readonly<{
  title: string;
  items: readonly string[];
}>;

function IssueBlock({ title, items }: IssueBlockProps) {
  return (
    <section className="studio-sidebar__issues">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
