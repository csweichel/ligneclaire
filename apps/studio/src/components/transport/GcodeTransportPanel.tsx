import { useEffect, useRef } from "react";
import { Button, Input, Progress, Select, cn } from "@ligneclaire/ui";
import type { StudioModel } from "../../types";
import {
  findSelectedPlotter,
  formatOversizeHandlingLabel,
} from "../../lib/exportSettings";
import {
  formatExportRotationSummary,
  resolveGcodeRotationDeg,
} from "../../lib/gcodeOrientation";
import {
  CodeBlock,
  EmptyState,
  Field,
  InfoRow,
  Notice,
  PanelCard,
} from "../common/StudioPrimitives";
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
    <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-h-0 gap-4 xl:grid-rows-[minmax(0,1fr)_minmax(220px,0.9fr)]">
        <PanelCard className="min-h-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary">
              Virtual Preview
            </h3>
          </div>

          <div className="min-h-0">
            <GcodeVirtualPreview
              activeLineNumber={studio.transport.progress.sentLines}
              artifact={studio.transport.preparedArtifact}
              isPreparing={studio.transport.jobState === "preparing"}
              page={plotter?.page ?? null}
            />
          </div>

          <div className="grid gap-2">
            <InfoRow
              label="Drawing segments"
              value={String(studio.transport.preparedArtifact?.preview.drawingSegments ?? "--")}
            />
            <InfoRow
              label="Travel segments"
              value={String(studio.transport.preparedArtifact?.preview.travelSegments ?? "--")}
            />
          </div>
        </PanelCard>

        <PanelCard className="min-h-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary">
              Transport Log
            </h3>
            <span className="text-xs font-medium text-lc-text-muted">
              {studio.transport.logs.length} entries
            </span>
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
                Prepare or send G-code to see serial feedback and virtual device activity here.
              </EmptyState>
            )}
          </div>
        </PanelCard>
      </div>

      <aside className="grid min-h-0 content-start gap-4 overflow-auto xl:border-l xl:border-lc-border xl:pl-5">
        <Notice>
          G-code is generated from the current document and selected plotter profile, then either
          streamed to a browser USB serial device or simulated in the virtual plotter.
        </Notice>

        <div>
          <ExportSettingsButton
            fullWidth
            studio={studio}
            onClick={onOpenExportSettingsModal}
          />
        </div>

        <PanelCard>
          <Field label="Target">
            <Select
              className="h-9"
              value={studio.transport.settings.target}
              onChange={(event) => {
                studio.transport.setTarget(event.currentTarget.value as "serial" | "virtual");
              }}
            >
              <option value="serial">USB Serial Device</option>
              <option value="virtual">Virtual Plotter</option>
            </Select>
          </Field>

          {studio.transport.settings.target === "serial" ? (
            <>
              {!studio.transport.supported ? (
                <EmptyState>
                  This browser does not expose the Web Serial API. Use a Chromium-based browser to
                  connect a USB serial plotter directly.
                </EmptyState>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 max-sm:flex-col">
                    <Button
                      disabled={studio.transport.connectionState === "connected"}
                      variant="outline"
                      onClick={() => {
                        void studio.transport.connect();
                      }}
                    >
                      Connect
                    </Button>
                    <Button
                      disabled={studio.transport.connectionState !== "connected"}
                      variant="outline"
                      onClick={() => {
                        void studio.transport.disconnect();
                      }}
                    >
                      Disconnect
                    </Button>

                    <Button
                      disabled={
                        !studio.transport.canResetAlarm ||
                        studio.transport.connectionState !== "connected" ||
                        studio.transport.jobState === "preparing" ||
                        studio.transport.jobState === "sending" ||
                        studio.transport.jobState === "paused"
                      }
                      variant="outline"
                      onClick={() => {
                        void studio.transport.resetAlarm();
                      }}
                    >
                      Reset Alarm
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Baud">
                      <Input
                        className="h-9"
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
                    </Field>

                    <Field label="Responses">
                      <Select
                        className="h-9"
                        value={studio.transport.settings.responseMode}
                        onChange={(event) => {
                          studio.transport.updateSettings({
                            responseMode: event.currentTarget.value as "ack" | "timed",
                          });
                        }}
                      >
                        <option value="ack">Wait for ack</option>
                        <option value="timed">Timed send</option>
                      </Select>
                    </Field>

                    <Field label="Line ending">
                      <Select
                        className="h-9"
                        value={studio.transport.settings.lineEnding}
                        onChange={(event) => {
                          studio.transport.updateSettings({
                            lineEnding: event.currentTarget.value as "lf" | "crlf",
                          });
                        }}
                      >
                        <option value="lf">LF</option>
                        <option value="crlf">CRLF</option>
                      </Select>
                    </Field>

                    <Field
                      label={
                        studio.transport.settings.responseMode === "ack"
                          ? "Ack timeout"
                          : "Line delay"
                      }
                    >
                      <Input
                        className="h-9"
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
                    </Field>
                  </div>
                </>
              )}
            </>
          ) : null}
        </PanelCard>

        <PanelCard>
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2 max-sm:flex-col">
              <Button
              disabled={!canPrepare || studio.transport.jobState === "preparing"}
              variant="outline"
              onClick={() => {
                void studio.transport.prepare();
              }}
            >
              {studio.transport.preparedArtifact ? "Refresh G-code" : "Prepare G-code"}
              </Button>

              <Button
              disabled={sendDisabled}
              variant="default"
              onClick={() => {
                void studio.transport.send();
              }}
            >
              {studio.transport.settings.target === "virtual" ? "Run Virtual Plotter" : "Send G-code"}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 max-sm:flex-col">
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

          <div className="grid gap-2">
            <Progress value={progressPercent} />
            <div className="text-right text-sm text-lc-text-secondary">
              {studio.transport.progress.sentLines}/{studio.transport.progress.totalLines} lines
            </div>
          </div>

          <Button
            className="w-full"
            variant="outline"
            onClick={() => {
              studio.transport.clearLogs();
            }}
          >
            Clear log
          </Button>

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

          <div className="grid gap-2">
            <InfoRow label="Connection" value={connectionLabel(studio)} />
            <InfoRow label="Job" value={jobLabel(studio)} />
            <InfoRow label="Plotter" value={plotter?.label ?? "--"} />
            <InfoRow label="Orientation" value={orientationLabel} />
            <InfoRow
              label="Oversize"
              value={formatOversizeHandlingLabel(studio.exportSettings.oversizeHandling)}
            />
            <InfoRow
              label="Prepared file"
              value={studio.transport.preparedArtifact?.fileName ?? "--"}
            />
            <InfoRow label="Port" value={studio.transport.portLabel ?? "--"} />
            <InfoRow
              label="Acknowledged"
              value={String(studio.transport.progress.acknowledgedLines)}
            />
            <InfoRow label="Errors" value={String(studio.transport.progress.errorLines)} />
            <InfoRow label="Last response" value={studio.transport.lastResponse ?? "--"} />
            <InfoRow
              label="Last machine fault"
              value={studio.transport.lastMachineError ?? "--"}
            />
          </div>

        {studio.transport.preparedStale ? (
          <Notice tone="warning">
            The prepared G-code is stale. Refresh before sending if you want the latest parameter,
            plotter, orientation, or oversize settings included.
          </Notice>
        ) : null}
        </PanelCard>
      </aside>
    </div>
  );
}
