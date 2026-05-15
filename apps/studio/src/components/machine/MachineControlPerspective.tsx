import { useEffect, useRef, useState } from "react";
import { Button, Input, Popover, PopoverContent, PopoverTrigger, Select, cn } from "@ligneclaire/ui";
import { findSelectedPlotter } from "../../lib/exportSettings";
import type { StudioModel } from "../../types";
import {
  CodeBlock,
  EmptyState,
  Field,
  InfoRow,
  Notice,
  PanelCard,
} from "../common/StudioPrimitives";
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
  return Number.isFinite(value) ? value!.toFixed(2) : "--";
}

function formatPositionTitle(value: number | undefined): string {
  return Number.isFinite(value) ? value!.toFixed(4) : "--";
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
    await studio.transport.zeroCurrentAxes(axes);
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
    <section className="grid h-full min-h-0 gap-5 bg-lc-app p-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="grid min-h-0 content-start gap-4 overflow-auto">
        <PanelCard>
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1">
              <span className="text-base font-semibold text-lc-text">
                {plotter?.label ?? "No plotter selected"}
              </span>
              <span className="text-sm font-medium text-lc-text-secondary">
                {connectionLabel(studio)}
              </span>
            </div>
            {studio.transport.connectionState === "connected" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setMachineSectionExpanded((current) => !current);
                }}
              >
                {machineSectionCollapsed ? "Show" : "Hide"}
              </Button>
            ) : null}
          </div>

          {machineSectionCollapsed ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                disabled={!canDisconnect}
                variant="outline"
                onClick={() => {
                  void studio.transport.disconnect();
                }}
              >
                Disconnect
              </Button>
              <Button
                disabled={!studio.transport.canResetAlarm || !canDisconnect}
                variant="outline"
                onClick={() => {
                  void studio.transport.resetAlarm();
                }}
              >
                Reset Alarm
              </Button>
            </div>
          ) : (
            <>
              <Field label="Selector">
                <Select
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
                </Select>
              </Field>

              {studio.transport.supported ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    disabled={!canConnect}
                    variant="outline"
                    onClick={() => {
                      void studio.transport.connect();
                    }}
                  >
                    Connect
                  </Button>
                  <Button
                    disabled={!canDisconnect}
                    variant="outline"
                    onClick={() => {
                      void studio.transport.disconnect();
                    }}
                  >
                    Disconnect
                  </Button>
                  <Button
                    disabled={!studio.transport.canResetAlarm || !canDisconnect}
                    variant="outline"
                    onClick={() => {
                      void studio.transport.resetAlarm();
                    }}
                  >
                    Reset Alarm
                  </Button>
                </div>
              ) : (
                <EmptyState>
                  This browser does not expose the Web Serial API. Use a Chromium-based browser to
                  connect the plotter directly.
                </EmptyState>
              )}

              <div className="grid gap-2">
                <InfoRow label="Connection" value={connectionLabel(studio)} />
                <InfoRow label="Port" value={studio.transport.portLabel ?? "--"} />
                <InfoRow label="Job" value={jobLabel(studio)} />
                <InfoRow
                  label="Page"
                  value={plotter ? `${plotter.page.widthMm} x ${plotter.page.heightMm} mm` : "--"}
                />
              </div>
            </>
          )}
        </PanelCard>

        <PanelCard>
          <div className="grid gap-4">
            <div className="grid gap-3">
              <span className="font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary">
                {positionSourceLabel}
              </span>
              <div className="grid gap-2 sm:grid-cols-3">
                <PositionAxisCard
                  axis="X"
                  title={formatPositionTitle(studio.transport.position?.x)}
                  value={formatPositionValue(studio.transport.position?.x)}
                />
                <PositionAxisCard
                  axis="Y"
                  title={formatPositionTitle(studio.transport.position?.y)}
                  value={formatPositionValue(studio.transport.position?.y)}
                />
                <PositionAxisCard
                  axis="Z"
                  title={formatPositionTitle(studio.transport.position?.z)}
                  value={formatPositionValue(studio.transport.position?.z)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Popover open={stepMenuOpen} onOpenChange={setStepMenuOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    More
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="grid gap-3">
                  <div ref={stepMenuRef} className="grid gap-3">
                    <Field label="X step">
                      <Input
                        className="h-9"
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
                    </Field>
                    <Field label="Y step">
                      <Input
                        className="h-9"
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
                    </Field>
                    <Field label="Z step">
                      <Input
                        className="h-9"
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
                    </Field>

                    <div className="grid gap-2">
                      <Button
                        disabled={!canRunManualCommand}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setStepMenuOpen(false);
                          void moveToZero();
                        }}
                      >
                        Move to zero
                      </Button>
                      <Button
                        disabled={!canZeroPosition}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setStepMenuOpen(false);
                          void studio.transport.zeroCurrentPosition();
                        }}
                      >
                        Zero XYZ
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        disabled={!canZeroPosition}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setStepMenuOpen(false);
                          void zeroAxes(["X"]);
                        }}
                      >
                        Zero X
                      </Button>
                      <Button
                        disabled={!canZeroPosition}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setStepMenuOpen(false);
                          void zeroAxes(["Y"]);
                        }}
                      >
                        Zero Y
                      </Button>
                      <Button
                        disabled={!canZeroPosition}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setStepMenuOpen(false);
                          void zeroAxes(["Z"]);
                        }}
                      >
                        Zero Z
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              <div />
              <JogPadButton
                disabled={!canJog}
                label="+Y"
                shortcut="↑"
                onClick={() => {
                  void jog("Y", jogSteps.y);
                }}
              />
              <div />
              <JogPadButton
                disabled={!canJog}
                label="-X"
                shortcut="←"
                onClick={() => {
                  void jog("X", -jogSteps.x);
                }}
              />
              <JogPadButton
                disabled={!canJog}
                label="-Y"
                shortcut="↓"
                onClick={() => {
                  void jog("Y", -jogSteps.y);
                }}
              />
              <JogPadButton
                disabled={!canJog}
                label="+X"
                shortcut="→"
                onClick={() => {
                  void jog("X", jogSteps.x);
                }}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <JogPadButton
                className="h-16"
                disabled={!canJog}
                label="+Z"
                shortcut="PgUp"
                onClick={() => {
                  void jog("Z", jogSteps.z);
                }}
              />
              <JogPadButton
                className="h-16"
                disabled={!canJog}
                label="-Z"
                shortcut="PgDn"
                onClick={() => {
                  void jog("Z", -jogSteps.z);
                }}
              />
            </div>
          </div>
        </PanelCard>

        <PanelCard>
          <div className="font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary">
            Mesh sampler
          </div>

          <input
            ref={meshFileInputRef}
            accept=".json,application/json"
            className="hidden"
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

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              onClick={() => {
                meshFileInputRef.current?.click();
              }}
            >
              Load
            </Button>
            <Button
              disabled={!studio.heightMesh.mesh}
              variant="outline"
              onClick={() => {
                studio.heightMesh.download();
              }}
            >
              Save
            </Button>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
            <Field label="Width">
              <Input
                className="h-9"
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
            </Field>
            <span className="pb-3 text-lc-text-muted">x</span>
            <Field label="Height">
              <Input
                className="h-9"
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
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="Sampling dist">
              <Input
                className="h-9"
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
            </Field>

            <Button
              disabled={!canSample}
              variant="default"
              onClick={() => {
                void studio.heightMesh.sample();
              }}
            >
              {studio.heightMesh.status.state === "sampling" ? "Sampling..." : "Sample"}
            </Button>
          </div>

          <div className="grid gap-2">
            {studio.heightMesh.grid ? (
              <>
                <InfoRow
                  label="Probe grid"
                  value={`${studio.heightMesh.grid.columns} x ${studio.heightMesh.grid.rows}`}
                />
                <InfoRow
                  label="Actual spacing"
                  value={`${studio.heightMesh.grid.spacingXMm.toFixed(2)} x ${studio.heightMesh.grid.spacingYMm.toFixed(2)} mm`}
                />
              </>
            ) : null}

            {studio.heightMesh.mesh ? (
              <InfoRow
                label="Current mesh"
                value={`${studio.heightMesh.mesh.grid.columns} x ${studio.heightMesh.mesh.grid.rows}${studio.heightMesh.deviceMismatch ? " wrong plotter" : ""}`}
              />
            ) : null}
          </div>

          {!plotter?.gcode?.heightMeshSampler ? (
            <Notice tone="warning">
              This machine profile does not define probing defaults yet, so mesh sampling is
              unavailable.
            </Notice>
          ) : null}

          {studio.heightMesh.status.errorMessage ? (
            <Notice tone="destructive">{studio.heightMesh.status.errorMessage}</Notice>
          ) : null}
        </PanelCard>
      </aside>

      <div className="grid min-h-0 gap-4 xl:grid-rows-[auto_minmax(0,1fr)_minmax(260px,0.42fr)]">
        <div className="flex flex-wrap gap-3">
          <Button
            className="h-12 min-w-[156px]"
            disabled={!canPrepare || busy}
            variant="outline"
            onClick={() => {
              void studio.transport.prepare();
            }}
          >
            {studio.transport.jobState === "preparing" ? "Loading..." : "Load GCode"}
          </Button>

          <Button
            className="h-12 min-w-[156px]"
            disabled={!canPrepare || studio.pendingExport !== null}
            variant="outline"
            onClick={() => {
              void studio.exportGcode();
            }}
          >
            {studio.pendingExport === "gcode" ? "Saving..." : "Save GCode"}
          </Button>
        </div>

        <PanelCard
          className="min-h-0"
          contentClassName="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto_auto]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="inline-flex min-h-8 items-center rounded-lc-control border border-lc-border bg-lc-panel-subtle px-3 font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary">
              Preview
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={sendDisabled}
                variant="default"
                onClick={() => {
                  void studio.transport.send();
                }}
              >
                Send
              </Button>
              <Button
                disabled={studio.transport.jobState !== "sending"}
                variant="outline"
                onClick={() => {
                  studio.transport.pause();
                }}
              >
                Pause
              </Button>
              <Button
                disabled={studio.transport.jobState !== "paused"}
                variant="outline"
                onClick={() => {
                  studio.transport.resume();
                }}
              >
                Resume
              </Button>
              <Button
                disabled={
                  studio.transport.jobState !== "sending" &&
                  studio.transport.jobState !== "paused"
                }
                variant="destructive"
                onClick={() => {
                  studio.transport.cancel();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>

          <div className="min-h-0 overflow-hidden rounded-lc-control border border-lc-border bg-lc-panel">
            <GcodeVirtualPreview
              activeLineNumber={studio.transport.progress.sentLines}
              artifact={studio.transport.preparedArtifact}
              isPreparing={studio.transport.jobState === "preparing"}
              page={plotter?.page ?? null}
            />
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <InfoRow
              label="Prepared file"
              value={studio.transport.preparedArtifact?.fileName ?? "--"}
            />
            <InfoRow
              label="Segments"
              value={
                studio.transport.preparedArtifact
                  ? `${studio.transport.preparedArtifact.preview.drawingSegments} draw / ${studio.transport.preparedArtifact.preview.travelSegments} travel`
                  : "--"
              }
            />
            <InfoRow
              label="Progress"
              value={`${studio.transport.progress.sentLines}/${studio.transport.progress.totalLines} lines`}
            />
            <InfoRow label="Status" value={studio.status.message} />
          </div>

          {studio.transport.preparedStale ? (
            <Notice tone="warning">
              The prepared G-code is stale. Load GCode again before sending if parameters or the
              selected machine changed.
            </Notice>
          ) : null}
        </PanelCard>

        <PanelCard
          className="min-h-0"
          contentClassName="grid h-full min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)]"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary">
              Console
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                studio.transport.clearLogs();
              }}
            >
              Clear
            </Button>
          </div>

          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void sendRawCommand();
            }}
          >
            <Input
              disabled={!canRunManualCommand}
              placeholder="Send raw G-code, e.g. G0 X0 Y0"
              type="text"
              value={rawCommand}
              onChange={(event) => {
                setRawCommand(event.currentTarget.value);
              }}
            />
            <Button
              disabled={!canRunManualCommand || rawCommand.trim().length === 0}
              type="submit"
              variant="outline"
            >
              Send
            </Button>
          </form>

          {studio.transport.lastError ? (
            <div className="grid gap-2">
              <span className="font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary">
                Last Error
              </span>
              <CodeBlock>{studio.transport.lastError}</CodeBlock>
              {studio.transport.lastMachineError &&
              studio.transport.lastMachineError !== studio.transport.lastError ? (
                <CodeBlock>{studio.transport.lastMachineError}</CodeBlock>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <InfoRow label="Last response" value={studio.transport.lastResponse ?? "--"} />
            <InfoRow label="Last fault" value={studio.transport.lastMachineError ?? "--"} />
            <InfoRow
              label="Acknowledged"
              value={String(studio.transport.progress.acknowledgedLines)}
            />
            <InfoRow label="Errors" value={String(studio.transport.progress.errorLines)} />
          </div>

          <div className="min-h-0 overflow-auto rounded-lc-control border border-lc-console-border bg-lc-console">
            {studio.transport.logs.length > 0 ? (
              studio.transport.logs.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[68px_54px_minmax(0,1fr)] gap-3 border-t border-lc-console-border px-3 py-2 font-lc-mono text-xs leading-6 text-lc-console-text first:border-t-0"
                >
                  <span>{entry.timeLabel}</span>
                  <span
                    className={cn(
                      "font-semibold",
                      entry.level === "error" && "text-lc-console-error",
                      entry.level === "rx" && "text-lc-console-rx",
                      entry.level === "tx" && "text-lc-console-tx"
                    )}
                  >
                    {entry.level.toUpperCase()}
                  </span>
                  <span>{entry.message}</span>
                </div>
              ))
            ) : (
              <EmptyState className="m-3">
                Connect the machine, jog, sample, or send G-code to populate the console.
              </EmptyState>
            )}
          </div>
        </PanelCard>
      </div>
    </section>
  );
}

type PositionAxisCardProps = Readonly<{
  axis: string;
  title: string;
  value: string;
}>;

function PositionAxisCard({ axis, title, value }: PositionAxisCardProps) {
  return (
    <div className="grid gap-2 rounded-lc-control border border-lc-console-border bg-lc-console px-3 py-3">
      <small className="font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-console-tx">
        {axis}
      </small>
      <span
        className="overflow-hidden text-right font-lc-mono text-[24px] font-bold leading-8 tracking-[-0.02em] tabular-nums text-lc-console-text md:text-[30px] md:leading-9 xl:text-[36px] xl:leading-11"
        title={title}
      >
        {value}
      </span>
    </div>
  );
}

type JogPadButtonProps = Readonly<{
  className?: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
  shortcut: string;
}>;

function JogPadButton({
  className,
  disabled,
  label,
  onClick,
  shortcut,
}: JogPadButtonProps) {
  return (
    <Button
      className={cn(
        "h-[72px] w-full flex-col rounded-lc-control border-lc-border bg-lc-panel text-lc-text hover:bg-lc-panel-hover",
        className
      )}
      disabled={disabled}
      variant="outline"
      onClick={onClick}
    >
      <span className="text-base font-semibold">{label}</span>
      <small className="text-xs font-medium text-lc-text-secondary">{shortcut}</small>
    </Button>
  );
}
