import { useRef } from "react";
import { findSelectedPlotter } from "../../lib/exportSettings";
import type { StudioModel } from "../../types";
import { StudioModalFrame } from "../common/StudioModalFrame";

type HeightMeshSamplerModalProps = Readonly<{
  onClose: () => void;
  studio: StudioModel;
}>;

function connectionLabel(studio: StudioModel): string {
  switch (studio.transport.connectionState) {
    case "unsupported":
      return "Browser unsupported";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "disconnected":
      return "Disconnected";
  }
}

function formatGridSpacing(value: number): string {
  return value > 0 ? `${value.toFixed(2)} mm` : "--";
}

export function HeightMeshSamplerModal({
  onClose,
  studio,
}: HeightMeshSamplerModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const plotter = findSelectedPlotter(studio.plotters, studio.heightMesh.activePlotterId);
  const mesh = studio.heightMesh.mesh;
  const canSample =
    Boolean(plotter?.gcode?.heightMeshSampler) &&
    studio.transport.supported &&
    studio.transport.jobState !== "preparing" &&
    studio.transport.jobState !== "sending" &&
    studio.transport.jobState !== "paused" &&
    studio.heightMesh.status.state !== "sampling";

  return (
    <StudioModalFrame
      eyebrow="Probe"
      onClose={onClose}
      surfaceClassName="studio-modal__surface--panel"
      title="Height mesh sampler"
    >
      <div className="export-settings height-mesh-panel">
        <div className="export-settings__content">
          <section className="export-settings__section">
            <div className="export-settings__intro">
              <p className="export-settings__lead">
                Probe the selected sheet with the current plotter profile, download the mesh as
                JSON, or load an existing mesh back into G-code export.
              </p>
            </div>

            <label className="studio-field">
              <span className="studio-field__label">Machine</span>
              <select
                className="studio-input"
                disabled={studio.plotters.length === 0}
                value={studio.heightMesh.activePlotterId}
                onChange={(event) => {
                  studio.heightMesh.setActivePlotterId(event.currentTarget.value);
                }}
              >
                {studio.plotters.length > 0 ? (
                  studio.plotters.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.label}
                    </option>
                  ))
                ) : (
                  <option value="">No plotter profiles</option>
                )}
              </select>
            </label>

            {plotter ? (
              <>
                <div className="studio-sidebar__meta-grid">
                  <span>Plotter</span>
                  <span>{plotter.label}</span>
                </div>
                <div className="studio-sidebar__meta-grid">
                  <span>Page size</span>
                  <span>
                    {plotter.page.widthMm} x {plotter.page.heightMm} mm
                  </span>
                </div>
                <div className="studio-sidebar__meta-grid">
                  <span>Connection</span>
                  <span>{connectionLabel(studio)}</span>
                </div>
              </>
            ) : (
              <div className="studio-empty-state">
                Select a plotter profile before sampling a height mesh.
              </div>
            )}
          </section>

          <section className="export-settings__section">
            <div className="export-settings__section-header">
              <h3>Sampling region</h3>
              <p>Set the sheet size and point spacing. Probe travel and depth come from the plotter config.</p>
            </div>

            <div className="gcode-transport__settings-grid">
              <label className="studio-field">
                <span className="studio-field__label">Sheet width</span>
                <input
                  className="studio-input studio-input--compact"
                  min={1}
                  step={1}
                  type="number"
                  value={studio.heightMesh.settings.widthMm}
                  onChange={(event) => {
                    studio.heightMesh.updateSettings({
                      widthMm: Number(event.currentTarget.value) || 1,
                    });
                  }}
                />
              </label>

              <label className="studio-field">
                <span className="studio-field__label">Sheet height</span>
                <input
                  className="studio-input studio-input--compact"
                  min={1}
                  step={1}
                  type="number"
                  value={studio.heightMesh.settings.heightMm}
                  onChange={(event) => {
                    studio.heightMesh.updateSettings({
                      heightMm: Number(event.currentTarget.value) || 1,
                    });
                  }}
                />
              </label>

              <label className="studio-field">
                <span className="studio-field__label">Sample distance</span>
                <input
                  className="studio-input studio-input--compact"
                  min={0.5}
                  step={0.5}
                  type="number"
                  value={studio.heightMesh.settings.sampleDistanceMm}
                  onChange={(event) => {
                    studio.heightMesh.updateSettings({
                      sampleDistanceMm: Number(event.currentTarget.value) || 0.5,
                    });
                  }}
                />
              </label>
            </div>

            {studio.heightMesh.grid ? (
              <>
                <div className="studio-sidebar__meta-grid">
                  <span>Probe points</span>
                  <span>
                    {studio.heightMesh.grid.columns} x {studio.heightMesh.grid.rows}
                  </span>
                </div>
                <div className="studio-sidebar__meta-grid">
                  <span>Actual X spacing</span>
                  <span>{formatGridSpacing(studio.heightMesh.grid.spacingXMm)}</span>
                </div>
                <div className="studio-sidebar__meta-grid">
                  <span>Actual Y spacing</span>
                  <span>{formatGridSpacing(studio.heightMesh.grid.spacingYMm)}</span>
                </div>
              </>
            ) : null}

            {!plotter?.gcode?.heightMeshSampler ? (
              <div className="studio-sidebar__issue">
                This plotter profile does not define probe move defaults yet, so sampling is
                unavailable. You can still import an existing mesh JSON below.
              </div>
            ) : null}
          </section>

          <section className="export-settings__section">
            <div className="export-settings__section-header">
              <h3>Serial connection</h3>
              <p>The sampler reuses the same browser serial connection as the G-code sender.</p>
            </div>

            {!studio.transport.supported ? (
              <div className="studio-empty-state">
                This browser does not expose the Web Serial API. Use a Chromium-based browser for
                direct USB serial probing.
              </div>
            ) : (
              <div className="studio-document-actions__row">
                <button
                  className="studio-button"
                  disabled={studio.transport.connectionState === "connected"}
                  type="button"
                  onClick={() => {
                    void studio.transport.connect();
                  }}
                >
                  Connect
                </button>

                <button
                  className="studio-button"
                  disabled={studio.transport.connectionState !== "connected"}
                  type="button"
                  onClick={() => {
                    void studio.transport.disconnect();
                  }}
                >
                  Disconnect
                </button>

                <button
                  className="studio-button"
                  disabled={
                    !studio.transport.canResetAlarm ||
                    studio.transport.connectionState !== "connected" ||
                    studio.transport.jobState === "preparing" ||
                    studio.transport.jobState === "sending" ||
                    studio.transport.jobState === "paused"
                  }
                  type="button"
                  onClick={() => {
                    void studio.transport.resetAlarm();
                  }}
                >
                  Reset Alarm
                </button>

                <button
                  className="studio-button studio-button--danger"
                  disabled={studio.heightMesh.status.state !== "sampling"}
                  type="button"
                  onClick={() => {
                    studio.transport.cancel();
                  }}
                >
                  Cancel Sampling
                </button>
              </div>
            )}
          </section>

          <section className="export-settings__section">
            <div className="export-settings__section-header">
              <h3>Current mesh</h3>
              <p>Loaded meshes are attached to subsequent G-code exports for compatible raw XY/Z plotters.</p>
            </div>

            {mesh ? (
              <>
                <div className="studio-sidebar__meta-grid">
                  <span>Captured on</span>
                  <span>{new Date(mesh.createdAt).toLocaleString()}</span>
                </div>
                <div className="studio-sidebar__meta-grid">
                  <span>Mesh plotter</span>
                  <span>{mesh.plotter.label ?? mesh.plotter.id}</span>
                </div>
                <div className="studio-sidebar__meta-grid">
                  <span>Samples</span>
                  <span>
                    {mesh.samples.length} ({mesh.grid.columns} x {mesh.grid.rows})
                  </span>
                </div>
                <div className="studio-sidebar__meta-grid">
                  <span>Z range</span>
                  <span>
                    {mesh.stats.minZMm.toFixed(3)} to {mesh.stats.maxZMm.toFixed(3)} mm
                  </span>
                </div>

                {studio.heightMesh.deviceMismatch ? (
                  <div className="studio-sidebar__issue">
                    The loaded mesh belongs to {mesh.plotter.label ?? mesh.plotter.id}. Switch the
                    export plotter back before exporting compensated G-code.
                  </div>
                ) : !plotter?.gcode?.heightMeshCompensation ? (
                  <div className="studio-sidebar__issue">
                    This plotter can load the mesh JSON, but its export profile does not currently
                    apply height compensation.
                  </div>
                ) : null}
              </>
            ) : (
              <div className="studio-empty-state">
                No mesh loaded yet. Sample one now or import a saved JSON file.
              </div>
            )}

            <div className="studio-document-actions__row">
              <input
                ref={fileInputRef}
                accept=".json,application/json"
                className="height-mesh-panel__file-input"
                type="file"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) {
                    return;
                  }

                  void studio.heightMesh.importFile(file);
                  event.currentTarget.value = "";
                }}
              />

              <button
                className="studio-button"
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                }}
              >
                Load JSON
              </button>

              <button
                className="studio-button"
                disabled={!mesh}
                type="button"
                onClick={() => {
                  studio.heightMesh.download();
                }}
              >
                Download JSON
              </button>

              <button
                className="studio-button studio-button--danger"
                disabled={!mesh}
                type="button"
                onClick={() => {
                  studio.heightMesh.clear();
                }}
              >
                Clear Mesh
              </button>
            </div>
          </section>

          <section className="export-settings__section">
            <div className="export-settings__section-header">
              <h3>Status</h3>
            </div>

            <div className="studio-sidebar__meta-grid">
              <span>Sampler state</span>
              <span>{studio.heightMesh.status.state}</span>
            </div>
            <div className="studio-sidebar__meta-grid">
              <span>Captured points</span>
              <span>
                {studio.heightMesh.status.capturedSamples}/{studio.heightMesh.status.totalSamples}
              </span>
            </div>
            <div className="studio-sidebar__meta-grid">
              <span>Last response</span>
              <span>{studio.transport.lastResponse ?? "--"}</span>
            </div>
            <div className="studio-sidebar__meta-grid">
              <span>Last machine fault</span>
              <span>{studio.transport.lastMachineError ?? "--"}</span>
            </div>

            {studio.heightMesh.status.errorMessage ? (
              <div className="studio-sidebar__issue">{studio.heightMesh.status.errorMessage}</div>
            ) : null}

            {studio.transport.lastError ? (
              <div className="gcode-transport__error-card">
                <span className="studio-field__label">Last Error</span>
                <pre className="gcode-transport__error-text">{studio.transport.lastError}</pre>
              </div>
            ) : null}
          </section>
        </div>

        <div className="export-settings__footer">
          <button
            className="studio-button studio-button--primary"
            disabled={!canSample}
            type="button"
            onClick={() => {
              void studio.heightMesh.sample();
            }}
          >
            {studio.heightMesh.status.state === "sampling" ? "Sampling..." : "Sample Mesh"}
          </button>
        </div>
      </div>
    </StudioModalFrame>
  );
}
