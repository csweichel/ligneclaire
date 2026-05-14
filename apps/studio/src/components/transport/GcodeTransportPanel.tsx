import { useEffect, useRef } from "react";
import type { StudioModel } from "../../types";
import {
  findSelectedPlotter,
  formatOversizeHandlingLabel,
} from "../../lib/exportSettings";
import {
  formatExportRotationSummary,
  resolveGcodeRotationDeg,
} from "../../lib/gcodeOrientation";
import { ExportSettingsButton } from "../export/ExportSettingsButton";
import { GcodeVirtualPreview } from "./GcodeVirtualPreview";

type GcodeTransportPanelProps = Readonly<{
  onOpenExportSettingsModal: () => void;
  studio: StudioModel;
}>;

type PreparedSnapshotSignature = Readonly<{
  deviceId?: string;
  oversizeHandling?: string;
  rotationDeg?: number;
}> | null;

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

function jobLabel(studio: StudioModel): string {
  switch (studio.transport.jobState) {
    case "idle":
      return "Idle";
    case "preparing":
      return "Preparing";
    case "ready":
      return "Ready";
    case "sending":
      return "Sending";
    case "paused":
      return "Paused";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function parsePreparedSnapshotSignature(snapshot: string | null): PreparedSnapshotSignature {
  if (!snapshot) {
    return null;
  }

  try {
    const parsed = JSON.parse(snapshot) as {
      deviceId?: unknown;
      oversizeHandling?: unknown;
      rotationDeg?: unknown;
    };

    return {
      deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : undefined,
      oversizeHandling:
        typeof parsed.oversizeHandling === "string" ? parsed.oversizeHandling : undefined,
      rotationDeg: typeof parsed.rotationDeg === "number" ? parsed.rotationDeg : undefined,
    };
  } catch {
    return null;
  }
}

export function GcodeTransportPanel({
  onOpenExportSettingsModal,
  studio,
}: GcodeTransportPanelProps) {
  const autoPrepareRequestedRef = useRef(false);
  const plotter = findSelectedPlotter(
    studio.plotters,
    studio.exportSettings.deviceId
  );
  const resolvedRotationDeg = resolveGcodeRotationDeg(
    studio.exportSettings.rotationDeg,
    studio.programDetails?.canvas,
    plotter
  );
  const orientationLabel = formatExportRotationSummary(
    studio.exportSettings.rotationDeg,
    studio.programDetails?.canvas,
    plotter
  );
  const preparedSignature = parsePreparedSnapshotSignature(
    studio.transport.preparedArtifact?.snapshot ?? null
  );
  const previewNeedsRefresh =
    studio.transport.preparedArtifact !== null &&
    (preparedSignature?.deviceId !== studio.exportSettings.deviceId ||
      preparedSignature?.rotationDeg !== resolvedRotationDeg ||
      preparedSignature?.oversizeHandling !== studio.exportSettings.oversizeHandling);
  const canPrepare = Boolean(
    studio.current && studio.selectedProgramId && studio.exportSettings.deviceId && studio.tools?.vpypeGcode.available
  );
  const sendDisabled =
    !canPrepare ||
    (studio.transport.settings.target === "serial" &&
      studio.transport.connectionState !== "connected") ||
    studio.transport.jobState === "preparing" ||
    studio.transport.jobState === "paused" ||
    studio.transport.jobState === "sending";
  const progressPercent =
    studio.transport.progress.totalLines > 0
      ? (studio.transport.progress.sentLines / studio.transport.progress.totalLines) * 100
      : 0;

  useEffect(() => {
    if (
      studio.transport.jobState === "preparing" ||
      studio.transport.jobState === "sending" ||
      studio.transport.jobState === "paused"
    ) {
      return;
    }

    if (!autoPrepareRequestedRef.current) {
      if (!canPrepare) {
        return;
      }

      autoPrepareRequestedRef.current = true;
      void studio.transport.prepare();
      return;
    }

    if (previewNeedsRefresh) {
      void studio.transport.prepare();
    }
  }, [
    canPrepare,
    previewNeedsRefresh,
    studio.transport.jobState,
    studio.transport.prepare,
  ]);

  return (
    <div className="gcode-transport-panel">
      <div className="gcode-transport-panel__main">
        <section className="gcode-transport__preview-block">
          <div className="gcode-transport__preview-header">
            <h3>Virtual Preview</h3>
          </div>

          <GcodeVirtualPreview
            activeLineNumber={studio.transport.progress.sentLines}
            artifact={studio.transport.preparedArtifact}
            isPreparing={studio.transport.jobState === "preparing"}
            page={plotter?.page ?? null}
          />

          <div className="studio-sidebar__meta-grid">
            <span>Drawing segments</span>
            <span>{studio.transport.preparedArtifact?.preview.drawingSegments ?? "--"}</span>
          </div>
          <div className="studio-sidebar__meta-grid">
            <span>Travel segments</span>
            <span>{studio.transport.preparedArtifact?.preview.travelSegments ?? "--"}</span>
          </div>
        </section>

        <section className="gcode-transport__log">
          <div className="gcode-transport__preview-header">
            <h3>Transport Log</h3>
            <span>{studio.transport.logs.length} entries</span>
          </div>

          <div className="gcode-transport__log-list">
            {studio.transport.logs.length > 0 ? (
              studio.transport.logs.map((entry) => (
                <div
                  key={entry.id}
                  className={`gcode-transport__log-entry gcode-transport__log-entry--${entry.level}`}
                >
                  <span>{entry.timeLabel}</span>
                  <span>{entry.level.toUpperCase()}</span>
                  <span>{entry.message}</span>
                </div>
              ))
            ) : (
              <div className="studio-empty-state">
                Prepare or send G-code to see serial feedback and virtual device activity here.
              </div>
            )}
          </div>
        </section>
      </div>

      <aside className="gcode-transport-panel__sidebar">
        <div className="studio-sidebar__issue">
          G-code is generated from the current document and selected plotter profile, then either
          streamed to a browser USB serial device or simulated in the virtual plotter.
        </div>

        <div className="gcode-transport__group">
          <ExportSettingsButton
            fullWidth
            studio={studio}
            onClick={onOpenExportSettingsModal}
          />
        </div>

        <div className="gcode-transport__group">
          <label className="studio-field">
            <span className="studio-field__label">Target</span>
            <select
              className="studio-input studio-input--compact"
              value={studio.transport.settings.target}
              onChange={(event) => {
                studio.transport.setTarget(event.currentTarget.value as "serial" | "virtual");
              }}
            >
              <option value="serial">USB Serial Device</option>
              <option value="virtual">Virtual Plotter</option>
            </select>
          </label>

          {studio.transport.settings.target === "serial" ? (
            <>
              {!studio.transport.supported ? (
                <div className="studio-empty-state">
                  This browser does not expose the Web Serial API. Use a Chromium-based browser to
                  connect a USB serial plotter directly.
                </div>
              ) : (
                <>
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
                  </div>

                  <div className="gcode-transport__settings-grid">
                    <label className="studio-field">
                      <span className="studio-field__label">Baud</span>
                      <input
                        className="studio-input studio-input--compact"
                        min={1200}
                        step={1}
                        type="number"
                        value={studio.transport.settings.baudRate}
                        onChange={(event) => {
                          studio.transport.updateSettings({
                            baudRate: Math.max(1200, Number(event.currentTarget.value) || 1200),
                          });
                        }}
                      />
                    </label>

                    <label className="studio-field">
                      <span className="studio-field__label">Responses</span>
                      <select
                        className="studio-input studio-input--compact"
                        value={studio.transport.settings.responseMode}
                        onChange={(event) => {
                          studio.transport.updateSettings({
                            responseMode: event.currentTarget.value as "ack" | "timed",
                          });
                        }}
                      >
                        <option value="ack">Wait for ack</option>
                        <option value="timed">Timed send</option>
                      </select>
                    </label>

                    <label className="studio-field">
                      <span className="studio-field__label">Line ending</span>
                      <select
                        className="studio-input studio-input--compact"
                        value={studio.transport.settings.lineEnding}
                        onChange={(event) => {
                          studio.transport.updateSettings({
                            lineEnding: event.currentTarget.value as "lf" | "crlf",
                          });
                        }}
                      >
                        <option value="lf">LF</option>
                        <option value="crlf">CRLF</option>
                      </select>
                    </label>

                    <label className="studio-field">
                      <span className="studio-field__label">
                        {studio.transport.settings.responseMode === "ack" ? "Ack timeout" : "Line delay"}
                      </span>
                      <input
                        className="studio-input studio-input--compact"
                        min={0}
                        step={10}
                        type="number"
                        value={
                          studio.transport.settings.responseMode === "ack"
                            ? studio.transport.settings.ackTimeoutMs
                            : studio.transport.settings.lineDelayMs
                        }
                        onChange={(event) => {
                          const nextValue = Math.max(0, Number(event.currentTarget.value) || 0);
                          studio.transport.updateSettings(
                            studio.transport.settings.responseMode === "ack"
                              ? { ackTimeoutMs: nextValue }
                              : { lineDelayMs: nextValue }
                          );
                        }}
                      />
                    </label>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>

        <div className="studio-document-actions">
          <div className="studio-document-actions__row">
            <button
              className="studio-button"
              disabled={!canPrepare || studio.transport.jobState === "preparing"}
              type="button"
              onClick={() => {
                void studio.transport.prepare();
              }}
            >
              {studio.transport.preparedArtifact ? "Refresh G-code" : "Prepare G-code"}
            </button>

            <button
              className="studio-button studio-button--primary"
              disabled={sendDisabled}
              type="button"
              onClick={() => {
                void studio.transport.send();
              }}
            >
              {studio.transport.settings.target === "virtual" ? "Run Virtual Plotter" : "Send G-code"}
            </button>
          </div>

          <div className="studio-document-actions__row">
            <button
              className="studio-button"
              disabled={studio.transport.jobState !== "sending"}
              type="button"
              onClick={() => {
                studio.transport.pause();
              }}
            >
              Pause
            </button>

            <button
              className="studio-button"
              disabled={studio.transport.jobState !== "paused"}
              type="button"
              onClick={() => {
                studio.transport.resume();
              }}
            >
              Resume
            </button>

            <button
              className="studio-button studio-button--danger"
              disabled={
                studio.transport.jobState !== "sending" &&
                studio.transport.jobState !== "paused"
              }
              type="button"
              onClick={() => {
                studio.transport.cancel();
              }}
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="gcode-transport__progress">
          <div className="gcode-transport__progress-bar">
            <div
              className="gcode-transport__progress-fill"
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>
          <div className="gcode-transport__progress-label">
            {studio.transport.progress.sentLines}/{studio.transport.progress.totalLines} lines
          </div>
        </div>

        <div className="studio-document-actions__row">
          <button
            className="studio-button"
            type="button"
            onClick={() => {
              studio.transport.clearLogs();
            }}
          >
            Clear log
          </button>
        </div>

        {studio.transport.lastError ? (
          <div className="gcode-transport__error-card">
            <span className="studio-field__label">Last Error</span>
            <pre className="gcode-transport__error-text">{studio.transport.lastError}</pre>
            {studio.transport.lastMachineError &&
            studio.transport.lastMachineError !== studio.transport.lastError ? (
              <pre className="gcode-transport__error-text">
                {studio.transport.lastMachineError}
              </pre>
            ) : null}
          </div>
        ) : null}

        <div className="studio-sidebar__meta-grid">
          <span>Connection</span>
          <span>{connectionLabel(studio)}</span>
        </div>
        <div className="studio-sidebar__meta-grid">
          <span>Job</span>
          <span>{jobLabel(studio)}</span>
        </div>
        <div className="studio-sidebar__meta-grid">
          <span>Plotter</span>
          <span>{plotter?.label ?? "--"}</span>
        </div>
        <div className="studio-sidebar__meta-grid">
          <span>Orientation</span>
          <span>{orientationLabel}</span>
        </div>
        <div className="studio-sidebar__meta-grid">
          <span>Oversize</span>
          <span>{formatOversizeHandlingLabel(studio.exportSettings.oversizeHandling)}</span>
        </div>
        <div className="studio-sidebar__meta-grid">
          <span>Prepared file</span>
          <span>{studio.transport.preparedArtifact?.fileName ?? "--"}</span>
        </div>
        <div className="studio-sidebar__meta-grid">
          <span>Port</span>
          <span>{studio.transport.portLabel ?? "--"}</span>
        </div>
        <div className="studio-sidebar__meta-grid">
          <span>Acknowledged</span>
          <span>{studio.transport.progress.acknowledgedLines}</span>
        </div>
        <div className="studio-sidebar__meta-grid">
          <span>Errors</span>
          <span>{studio.transport.progress.errorLines}</span>
        </div>
        <div className="studio-sidebar__meta-grid">
          <span>Last response</span>
          <span>{studio.transport.lastResponse ?? "--"}</span>
        </div>
        <div className="studio-sidebar__meta-grid">
          <span>Last machine fault</span>
          <span>{studio.transport.lastMachineError ?? "--"}</span>
        </div>

        {studio.transport.preparedStale ? (
          <div className="studio-sidebar__issue">
            The prepared G-code is stale. Refresh before sending if you want the latest parameter,
            plotter, orientation, or oversize settings included.
          </div>
        ) : null}
      </aside>
    </div>
  );
}
