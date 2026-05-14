import { useEffect, useRef, useState } from "react";
import { findSelectedPlotter } from "../../lib/exportSettings";
import type { StudioModel } from "../../types";
import { GcodeVirtualPreview } from "../transport/GcodeVirtualPreview";

type MachineControlPerspectiveProps = Readonly<{
  studio: StudioModel;
}>;

type JogSteps = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

const defaultJogStepsMm = {
  x: 10,
  y: 10,
  z: 5,
} as const;

function normalizeStep(value: number, fallback: number): number {
  const nextValue = Math.abs(value);
  return Number.isFinite(nextValue) && nextValue >= 0.1 ? nextValue : fallback;
}

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

function formatSignedDistance(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString();
}

function formatPositionValue(value: number | undefined): string {
  return Number.isFinite(value) ? value!.toFixed(3) : "--";
}

export function MachineControlPerspective({
  studio,
}: MachineControlPerspectiveProps) {
  const meshFileInputRef = useRef<HTMLInputElement | null>(null);
  const stepMenuRef = useRef<HTMLDivElement | null>(null);
  const [manualJobPending, setManualJobPending] = useState(false);
  const [machineSectionExpanded, setMachineSectionExpanded] = useState(
    studio.transport.connectionState !== "connected"
  );
  const [rawCommand, setRawCommand] = useState("");
  const [stepMenuOpen, setStepMenuOpen] = useState(false);
  const [jogSteps, setJogSteps] = useState<JogSteps>({
    x: defaultJogStepsMm.x,
    y: defaultJogStepsMm.y,
    z: defaultJogStepsMm.z,
  });
  const plotter = findSelectedPlotter(studio.plotters, studio.exportSettings.deviceId);
  const busy =
    studio.transport.jobState === "preparing" ||
    studio.transport.jobState === "sending" ||
    studio.transport.jobState === "paused" ||
    manualJobPending;
  const travelCommand = plotter?.gcode?.travelCommand ?? "G0";
  const travelFeedRate =
    plotter?.gcode?.travelFeedRateMmPerMin ??
    plotter?.gcode?.feedRateMmPerMin ??
    1200;
  const canPrepare = Boolean(
    studio.current &&
      studio.selectedProgramId &&
      studio.exportSettings.deviceId &&
      studio.tools?.vpypeGcode.available
  );
  const canConnect =
    studio.transport.supported &&
    studio.transport.connectionState !== "connected" &&
    !busy;
  const canDisconnect =
    studio.transport.supported &&
    studio.transport.connectionState === "connected" &&
    !busy;
  const canJog =
    Boolean(plotter) &&
    studio.transport.connectionState === "connected" &&
    !busy;
  const canSample =
    Boolean(plotter?.gcode?.heightMeshSampler) &&
    studio.transport.supported &&
    studio.heightMesh.status.state !== "sampling" &&
    !busy;
  const canRunManualCommand =
    studio.transport.connectionState === "connected" &&
    !busy;
  const canZeroPosition =
    canRunManualCommand;
  const sendDisabled =
    !canPrepare ||
    studio.transport.connectionState !== "connected" ||
    busy;
  const machineSectionCollapsed =
    studio.transport.connectionState === "connected" && !machineSectionExpanded;
  const positionSourceLabel =
    studio.transport.position?.source === "machine"
      ? "MPos"
      : studio.transport.position?.source === "work"
        ? "WPos"
        : "Pos";

  async function runManualJob(label: string, lines: readonly string[]): Promise<boolean> {
    if (!canRunManualCommand || lines.length === 0) {
      return false;
    }

    try {
      setManualJobPending(true);
      await studio.transport.runSerialJob({
        label,
        lines,
      });
      return true;
    } catch {
      // Transport state already records the failure.
      return false;
    } finally {
      setManualJobPending(false);
    }
  }

  async function jog(axis: "X" | "Y" | "Z", distanceMm: number): Promise<void> {
    if (!plotter || !canJog) {
      return;
    }

    await runManualJob(
      `Jog ${axis}${distanceMm > 0 ? "+" : ""}${formatSignedDistance(distanceMm)}mm`,
      [
        "G91",
        `${travelCommand} ${axis}${formatSignedDistance(distanceMm)} F${formatSignedDistance(travelFeedRate)}`,
        "G90",
      ]
    );
  }

  async function moveToZero(): Promise<void> {
    await runManualJob("Move to zero", [
      "G90",
      `${travelCommand} X0 Y0 Z0 F${formatSignedDistance(travelFeedRate)}`,
    ]);
  }

  async function zeroAxes(axes: readonly ("X" | "Y" | "Z")[]): Promise<void> {
    if (axes.length === 0) {
      return;
    }

    await runManualJob(
      `Zero ${axes.join("")}`,
      [`G92 ${axes.map((axis) => `${axis}0`).join(" ")}`]
    );
  }

  async function sendRawCommand(): Promise<void> {
    const lines = rawCommand
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return;
    }

    const success = await runManualJob("Raw command", lines);
    if (success) {
      setRawCommand("");
    }
  }

  useEffect(() => {
    setMachineSectionExpanded(studio.transport.connectionState !== "connected");
  }, [studio.transport.connectionState]);

  useEffect(() => {
    if (!stepMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent): void {
      if (!stepMenuRef.current?.contains(event.target as Node)) {
        setStepMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setStepMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [stepMenuOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (!canJog || event.defaultPrevented || event.repeat) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, button, [contenteditable='true']")
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          void jog("Y", jogSteps.y);
          return;
        case "ArrowDown":
          event.preventDefault();
          void jog("Y", -jogSteps.y);
          return;
        case "ArrowLeft":
          event.preventDefault();
          void jog("X", -jogSteps.x);
          return;
        case "ArrowRight":
          event.preventDefault();
          void jog("X", jogSteps.x);
          return;
        case "PageUp":
          event.preventDefault();
          void jog("Z", jogSteps.z);
          return;
        case "PageDown":
          event.preventDefault();
          void jog("Z", -jogSteps.z);
          return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canJog, jogSteps.x, jogSteps.y, jogSteps.z, plotter]);

  return (
    <section className="machine-control">
      <aside className="machine-control__sidebar">
        <section className="machine-control__card">
          <div className="machine-control__machine-header">
            <div className="machine-control__machine-summary">
              <span className="machine-control__machine-name">
                {plotter?.label ?? "No plotter selected"}
              </span>
              <span className="machine-control__machine-status">{connectionLabel(studio)}</span>
            </div>
            {studio.transport.connectionState === "connected" ? (
              <button
                className="studio-button studio-button--compact"
                type="button"
                onClick={() => {
                  setMachineSectionExpanded((current) => !current);
                }}
              >
                {machineSectionCollapsed ? "Show" : "Hide"}
              </button>
            ) : null}
          </div>

          {machineSectionCollapsed ? (
            <div className="machine-control__button-grid machine-control__button-grid--machine-compact">
              <button
                className="studio-button"
                disabled={!canDisconnect}
                type="button"
                onClick={() => {
                  void studio.transport.disconnect();
                }}
              >
                Disconnect
              </button>
              <button
                className="studio-button"
                disabled={!studio.transport.canResetAlarm || !canDisconnect}
                type="button"
                onClick={() => {
                  void studio.transport.resetAlarm();
                }}
              >
                Reset Alarm
              </button>
            </div>
          ) : (
            <>
              <label className="studio-field">
                <span className="studio-field__label">Selector</span>
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

              {studio.transport.supported ? (
                <div className="machine-control__button-grid machine-control__button-grid--triple">
                  <button
                    className="studio-button"
                    disabled={!canConnect}
                    type="button"
                    onClick={() => {
                      void studio.transport.connect();
                    }}
                  >
                    Connect
                  </button>
                  <button
                    className="studio-button"
                    disabled={!canDisconnect}
                    type="button"
                    onClick={() => {
                      void studio.transport.disconnect();
                    }}
                  >
                    Disconnect
                  </button>
                  <button
                    className="studio-button"
                    disabled={!studio.transport.canResetAlarm || !canDisconnect}
                    type="button"
                    onClick={() => {
                      void studio.transport.resetAlarm();
                    }}
                  >
                    Reset Alarm
                  </button>
                </div>
              ) : (
                <div className="studio-empty-state">
                  This browser does not expose the Web Serial API. Use a Chromium-based browser to
                  connect the plotter directly.
                </div>
              )}

              <div className="machine-control__meta-grid">
                <span>Connection</span>
                <span>{connectionLabel(studio)}</span>
              </div>
              <div className="machine-control__meta-grid">
                <span>Port</span>
                <span>{studio.transport.portLabel ?? "--"}</span>
              </div>
              <div className="machine-control__meta-grid">
                <span>Job</span>
                <span>{jobLabel(studio)}</span>
              </div>
              <div className="machine-control__meta-grid">
                <span>Page</span>
                <span>
                  {plotter ? `${plotter.page.widthMm} x ${plotter.page.heightMm} mm` : "--"}
                </span>
              </div>
            </>
          )}
        </section>

        <section className="machine-control__card machine-control__card--jog">
          <div className="machine-control__jog-toolbar">
            <div className="machine-control__position-block">
              <span className="machine-control__position-source">{positionSourceLabel}</span>
              <div className="machine-control__position-readout">
                <div className="machine-control__position-axis">
                  <small>X</small>
                  <span>{formatPositionValue(studio.transport.position?.x)}</span>
                </div>
                <div className="machine-control__position-axis">
                  <small>Y</small>
                  <span>{formatPositionValue(studio.transport.position?.y)}</span>
                </div>
                <div className="machine-control__position-axis">
                  <small>Z</small>
                  <span>{formatPositionValue(studio.transport.position?.z)}</span>
                </div>
              </div>
            </div>

            <div className="machine-control__jog-toolbar-actions">
              <div ref={stepMenuRef} className="studio-action-menu">
                <button
                  aria-expanded={stepMenuOpen}
                  aria-haspopup="dialog"
                  className="studio-button studio-button--compact studio-action-menu__trigger"
                  type="button"
                  onClick={() => {
                    setStepMenuOpen((current) => !current);
                  }}
                >
                  More
                </button>

                {stepMenuOpen ? (
                  <div className="studio-action-menu__panel machine-control__steps-panel" role="dialog">
                    <label className="studio-field machine-control__steps-field">
                      <span className="studio-field__label">X step</span>
                      <input
                        className="studio-input studio-input--compact"
                        min={0.1}
                        step={0.1}
                        type="number"
                        value={jogSteps.x}
                        onChange={(event) => {
                          setJogSteps((existing) => ({
                            ...existing,
                            x: normalizeStep(Number(event.currentTarget.value), defaultJogStepsMm.x),
                          }));
                        }}
                      />
                    </label>
                    <label className="studio-field machine-control__steps-field">
                      <span className="studio-field__label">Y step</span>
                      <input
                        className="studio-input studio-input--compact"
                        min={0.1}
                        step={0.1}
                        type="number"
                        value={jogSteps.y}
                        onChange={(event) => {
                          setJogSteps((existing) => ({
                            ...existing,
                            y: normalizeStep(Number(event.currentTarget.value), defaultJogStepsMm.y),
                          }));
                        }}
                      />
                    </label>
                    <label className="studio-field machine-control__steps-field">
                      <span className="studio-field__label">Z step</span>
                      <input
                        className="studio-input studio-input--compact"
                        min={0.1}
                        step={0.1}
                        type="number"
                        value={jogSteps.z}
                        onChange={(event) => {
                          setJogSteps((existing) => ({
                            ...existing,
                            z: normalizeStep(Number(event.currentTarget.value), defaultJogStepsMm.z),
                          }));
                        }}
                      />
                    </label>

                    <div className="machine-control__overflow-actions">
                      <button
                        className="studio-button studio-button--compact"
                        disabled={!canRunManualCommand}
                        type="button"
                        onClick={() => {
                          setStepMenuOpen(false);
                          void moveToZero();
                        }}
                      >
                        Move to zero
                      </button>
                      <button
                        className="studio-button studio-button--compact"
                        disabled={!canZeroPosition}
                        type="button"
                        onClick={() => {
                          setStepMenuOpen(false);
                          void studio.transport.zeroCurrentPosition();
                        }}
                      >
                        Zero XYZ
                      </button>
                    </div>

                    <div className="machine-control__overflow-axis-actions">
                      <button
                        className="studio-button studio-button--compact"
                        disabled={!canZeroPosition}
                        type="button"
                        onClick={() => {
                          setStepMenuOpen(false);
                          void zeroAxes(["X"]);
                        }}
                      >
                        Zero X
                      </button>
                      <button
                        className="studio-button studio-button--compact"
                        disabled={!canZeroPosition}
                        type="button"
                        onClick={() => {
                          setStepMenuOpen(false);
                          void zeroAxes(["Y"]);
                        }}
                      >
                        Zero Y
                      </button>
                      <button
                        className="studio-button studio-button--compact"
                        disabled={!canZeroPosition}
                        type="button"
                        onClick={() => {
                          setStepMenuOpen(false);
                          void zeroAxes(["Z"]);
                        }}
                      >
                        Zero Z
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="machine-control__jog-layout">
            <div className="machine-control__jog-pad">
              <div />
              <button
                className="machine-control__jog-button"
                disabled={!canJog}
                type="button"
                onClick={() => {
                  void jog("Y", jogSteps.y);
                }}
              >
                <span>+Y</span>
                <small aria-hidden="true">↑</small>
              </button>
              <div />
              <button
                className="machine-control__jog-button"
                disabled={!canJog}
                type="button"
                onClick={() => {
                  void jog("X", -jogSteps.x);
                }}
              >
                <span>-X</span>
                <small aria-hidden="true">←</small>
              </button>
              <button
                className="machine-control__jog-button"
                disabled={!canJog}
                type="button"
                onClick={() => {
                  void jog("Y", -jogSteps.y);
                }}
              >
                <span>-Y</span>
                <small aria-hidden="true">↓</small>
              </button>
              <button
                className="machine-control__jog-button"
                disabled={!canJog}
                type="button"
                onClick={() => {
                  void jog("X", jogSteps.x);
                }}
              >
                <span>+X</span>
                <small aria-hidden="true">→</small>
              </button>
            </div>

            <div className="machine-control__jog-z">
              <button
                className="machine-control__jog-button machine-control__jog-button--z"
                disabled={!canJog}
                type="button"
                onClick={() => {
                  void jog("Z", jogSteps.z);
                }}
              >
                <span>+Z</span>
                <small aria-hidden="true">PgUp</small>
              </button>
              <button
                className="machine-control__jog-button machine-control__jog-button--z"
                disabled={!canJog}
                type="button"
                onClick={() => {
                  void jog("Z", -jogSteps.z);
                }}
              >
                <span>-Z</span>
                <small aria-hidden="true">PgDn</small>
              </button>
            </div>
          </div>
        </section>

        <section className="machine-control__card">
          <div className="machine-control__card-header">
            <span className="machine-control__card-tag">Mesh sampler</span>
          </div>

          <input
            ref={meshFileInputRef}
            accept=".json,application/json"
            className="machine-control__file-input"
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

          <div className="machine-control__button-grid">
            <button
              className="studio-button"
              type="button"
              onClick={() => {
                meshFileInputRef.current?.click();
              }}
            >
              Load
            </button>
            <button
              className="studio-button"
              disabled={!studio.heightMesh.mesh}
              type="button"
              onClick={() => {
                studio.heightMesh.download();
              }}
            >
              Save
            </button>
          </div>

          <div className="machine-control__dimension-grid">
            <label className="studio-field">
              <span className="studio-field__label">Width</span>
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
            <span className="machine-control__dimension-separator">x</span>
            <label className="studio-field">
              <span className="studio-field__label">Height</span>
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
          </div>

          <div className="machine-control__button-grid">
            <label className="studio-field">
              <span className="studio-field__label">Sampling dist</span>
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

            <button
              className="studio-button studio-button--primary"
              disabled={!canSample}
              type="button"
              onClick={() => {
                void studio.heightMesh.sample();
              }}
            >
              {studio.heightMesh.status.state === "sampling" ? "Sampling..." : "Sample"}
            </button>
          </div>

          {studio.heightMesh.grid ? (
            <>
              <div className="machine-control__meta-grid">
                <span>Probe grid</span>
                <span>
                  {studio.heightMesh.grid.columns} x {studio.heightMesh.grid.rows}
                </span>
              </div>
              <div className="machine-control__meta-grid">
                <span>Actual spacing</span>
                <span>
                  {studio.heightMesh.grid.spacingXMm.toFixed(2)} x{" "}
                  {studio.heightMesh.grid.spacingYMm.toFixed(2)} mm
                </span>
              </div>
            </>
          ) : null}

          {studio.heightMesh.mesh ? (
            <div className="machine-control__meta-grid">
              <span>Current mesh</span>
              <span>
                {studio.heightMesh.mesh.grid.columns} x {studio.heightMesh.mesh.grid.rows}
                {studio.heightMesh.deviceMismatch ? " wrong plotter" : ""}
              </span>
            </div>
          ) : null}

          {!plotter?.gcode?.heightMeshSampler ? (
            <div className="studio-sidebar__issue">
              This machine profile does not define probing defaults yet, so mesh sampling is
              unavailable.
            </div>
          ) : null}

          {studio.heightMesh.status.errorMessage ? (
            <div className="studio-sidebar__issue">{studio.heightMesh.status.errorMessage}</div>
          ) : null}
        </section>
      </aside>

      <div className="machine-control__main">
        <div className="machine-control__toolbar">
          <button
            className="studio-button machine-control__toolbar-button"
            disabled={!canPrepare || busy}
            type="button"
            onClick={() => {
              void studio.transport.prepare();
            }}
          >
            {studio.transport.jobState === "preparing" ? "Loading..." : "Load GCode"}
          </button>

          <button
            className="studio-button machine-control__toolbar-button"
            disabled={!canPrepare || studio.pendingExport !== null}
            type="button"
            onClick={() => {
              void studio.exportGcode();
            }}
          >
            {studio.pendingExport === "gcode" ? "Saving..." : "Save GCode"}
          </button>
        </div>

        <section className="machine-control__panel machine-control__panel--preview">
          <div className="machine-control__panel-header">
            <span className="machine-control__card-tag">Preview</span>
            <div className="machine-control__panel-actions">
              <button
                className="studio-button studio-button--primary"
                disabled={sendDisabled}
                type="button"
                onClick={() => {
                  void studio.transport.send();
                }}
              >
                Send
              </button>
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

          <div className="machine-control__preview-stage">
            <GcodeVirtualPreview
              activeLineNumber={studio.transport.progress.sentLines}
              artifact={studio.transport.preparedArtifact}
              isPreparing={studio.transport.jobState === "preparing"}
              page={plotter?.page ?? null}
            />
          </div>

          <div className="machine-control__status-grid">
            <div className="machine-control__meta-grid">
              <span>Prepared file</span>
              <span>{studio.transport.preparedArtifact?.fileName ?? "--"}</span>
            </div>
            <div className="machine-control__meta-grid">
              <span>Segments</span>
              <span>
                {studio.transport.preparedArtifact
                  ? `${studio.transport.preparedArtifact.preview.drawingSegments} draw / ${studio.transport.preparedArtifact.preview.travelSegments} travel`
                  : "--"}
              </span>
            </div>
            <div className="machine-control__meta-grid">
              <span>Progress</span>
              <span>
                {studio.transport.progress.sentLines}/{studio.transport.progress.totalLines} lines
              </span>
            </div>
            <div className="machine-control__meta-grid">
              <span>Status</span>
              <span>{studio.status.message}</span>
            </div>
          </div>

          {studio.transport.preparedStale ? (
            <div className="studio-sidebar__issue">
              The prepared G-code is stale. Load GCode again before sending if parameters or the
              selected machine changed.
            </div>
          ) : null}
        </section>

        <section className="machine-control__panel machine-control__panel--console">
          <div className="machine-control__panel-header">
            <div className="machine-control__panel-actions">
              <button
                className="studio-button"
                type="button"
                onClick={() => {
                  studio.transport.clearLogs();
                }}
              >
                Clear
              </button>
            </div>
          </div>

          <form
            className="machine-control__raw-command"
            onSubmit={(event) => {
              event.preventDefault();
              void sendRawCommand();
            }}
          >
            <input
              className="studio-input machine-control__raw-command-input"
              disabled={!canRunManualCommand}
              placeholder="Send raw G-code, e.g. G0 X0 Y0"
              type="text"
              value={rawCommand}
              onChange={(event) => {
                setRawCommand(event.currentTarget.value);
              }}
            />
            <button
              className="studio-button"
              disabled={!canRunManualCommand || rawCommand.trim().length === 0}
              type="submit"
            >
              Send
            </button>
          </form>

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

          <div className="machine-control__status-grid machine-control__status-grid--console">
            <div className="machine-control__meta-grid">
              <span>Last response</span>
              <span>{studio.transport.lastResponse ?? "--"}</span>
            </div>
            <div className="machine-control__meta-grid">
              <span>Last fault</span>
              <span>{studio.transport.lastMachineError ?? "--"}</span>
            </div>
            <div className="machine-control__meta-grid">
              <span>Acknowledged</span>
              <span>{studio.transport.progress.acknowledgedLines}</span>
            </div>
            <div className="machine-control__meta-grid">
              <span>Errors</span>
              <span>{studio.transport.progress.errorLines}</span>
            </div>
          </div>

          <div className="gcode-transport__log-list machine-control__console-log">
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
                Connect the machine, jog, sample, or send G-code to populate the console.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
