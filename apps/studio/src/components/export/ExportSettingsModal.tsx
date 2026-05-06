import { exportRotationOptions } from "../../lib/gcodeOrientation";
import {
  exportOversizeOptions,
  findSelectedPlotter,
  formatExportSettingsSummary,
  formatOversizeHandlingLabel,
} from "../../lib/exportSettings";
import { cx } from "../../lib/cx";
import type { ExportRotationSetting, StudioModel } from "../../types";
import { StudioModalFrame } from "../common/StudioModalFrame";

type ExportSettingsModalProps = Readonly<{
  onClose: () => void;
  studio: StudioModel;
}>;

function parseExportRotationSetting(value: string): ExportRotationSetting {
  switch (value) {
    case "0":
      return 0;
    case "90":
      return 90;
    case "180":
      return 180;
    case "270":
      return 270;
    case "auto":
    default:
      return "auto";
  }
}

export function ExportSettingsModal({
  onClose,
  studio,
}: ExportSettingsModalProps) {
  const plotter = findSelectedPlotter(studio.plotters, studio.exportSettings.deviceId);
  const summary = formatExportSettingsSummary(
    studio.exportSettings,
    studio.plotters,
    studio.programDetails?.canvas
  );
  const exportDisabled =
    !studio.current ||
    !studio.exportSettings.deviceId ||
    !studio.tools?.vpypeGcode.available ||
    studio.pendingExport !== null;

  return (
    <StudioModalFrame
      eyebrow="G-code"
      onClose={onClose}
      surfaceClassName="studio-modal__surface--panel"
      title="Export settings"
    >
      <div className="export-settings">
        <div className="export-settings__content">
          <section className="export-settings__section">
            <div className="export-settings__intro">
              <p className="export-settings__lead">
                Configure the plotter target and how G-code should adapt the page.
              </p>
              <p className="export-settings__summary">{summary}</p>
            </div>

            <label className="studio-field">
              <span className="studio-field__label">Plotter model</span>
              <select
                className="studio-input"
                disabled={studio.plotters.length === 0}
                value={studio.exportSettings.deviceId}
                onChange={(event) => {
                  studio.setExportDeviceId(event.currentTarget.value);
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
              <div className="studio-sidebar__meta-grid">
                <span>Page size</span>
                <span>
                  {plotter.page.widthMm} x {plotter.page.heightMm} mm
                </span>
              </div>
            ) : (
              <div className="studio-empty-state">
                Add a plotter profile to enable G-code export and transport.
              </div>
            )}
          </section>

          <section className="export-settings__section">
            <div className="export-settings__section-header">
              <h3>Orientation</h3>
              <p>Choose how the document should rotate before G-code generation.</p>
            </div>

            <div className="export-settings__choice-grid">
              {exportRotationOptions.map((option) => {
                const selected =
                  studio.exportSettings.rotationDeg === option.value;

                return (
                  <button
                    key={String(option.value)}
                    aria-pressed={selected}
                    className={cx(
                      "export-settings__choice",
                      selected && "export-settings__choice--active"
                    )}
                    type="button"
                    onClick={() => {
                      studio.setExportRotationDeg(
                        parseExportRotationSetting(String(option.value))
                      );
                    }}
                  >
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="export-settings__section">
            <div className="export-settings__section-header">
              <h3>Oversize handling</h3>
              <p>Control what happens when the program canvas is larger than the plotter page.</p>
            </div>

            <div className="export-settings__stack">
              {exportOversizeOptions.map((option) => {
                const selected = studio.exportSettings.oversizeHandling === option.value;

                return (
                  <button
                    key={option.value}
                    aria-pressed={selected}
                    className={cx(
                      "export-settings__card",
                      selected && "export-settings__card--active"
                    )}
                    type="button"
                    onClick={() => {
                      studio.setExportOversizeHandling(option.value);
                    }}
                  >
                    <span className="export-settings__card-title">{option.label}</span>
                    <span className="export-settings__card-copy">{option.description}</span>
                  </button>
                );
              })}
            </div>

            <div className="studio-sidebar__meta-grid">
              <span>Selected mode</span>
              <span>{formatOversizeHandlingLabel(studio.exportSettings.oversizeHandling)}</span>
            </div>
          </section>
        </div>

        <div className="export-settings__footer">
          <button
            className="studio-button studio-button--primary"
            disabled={exportDisabled}
            type="button"
            onClick={() => {
              void studio.exportGcode();
            }}
          >
            {studio.pendingExport === "gcode" ? "Exporting..." : "Export G-code"}
          </button>
        </div>
      </div>
    </StudioModalFrame>
  );
}
