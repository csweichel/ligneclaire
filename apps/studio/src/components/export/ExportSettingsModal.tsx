import { Button, Input, Select, Textarea, cn } from "@ligneclaire/ui";
import { exportRotationOptions } from "../../lib/gcodeOrientation";
import {
  exportOversizeOptions,
  findSelectedPlotter,
  formatExportSettingsSummary,
  formatOversizeHandlingLabel,
} from "../../lib/exportSettings";
import { formatPenMotionModeLabel } from "../../lib/penMotion";
import type { ExportRotationSetting, StudioModel } from "../../types";
import { EmptyState, Field, InfoRow, Notice } from "../common/StudioPrimitives";
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

function penMotionDefaultsForMode(
  studio: StudioModel,
  mode: "commands" | "z-depth"
): StudioModel["exportSettings"]["penMotion"] {
  const plotter = findSelectedPlotter(studio.plotters, studio.exportSettings.deviceId);
  const plotterPenMotion = plotter?.gcode?.penMotion;
  if (plotterPenMotion?.mode === mode) {
    return plotterPenMotion;
  }

  return mode === "commands"
    ? {
        mode,
        penUpCommand: "",
        penDownCommand: "",
      }
    : {
        mode,
        penUpZMm: 0,
        penDownZMm: 0,
      };
}

export function ExportSettingsModal({
  onClose,
  studio,
}: ExportSettingsModalProps) {
  const plotter = findSelectedPlotter(studio.plotters, studio.exportSettings.deviceId);
  const penMotion = studio.exportSettings.penMotion;
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
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]">
        <div className="grid min-h-0 gap-5 overflow-auto pr-1">
          <section className="grid gap-4 rounded-lc-control border border-lc-border bg-lc-panel-subtle p-4">
            <div className="grid gap-2">
              <p className="text-sm leading-6 text-lc-text-secondary">
                Configure the plotter target and how G-code should adapt the page.
              </p>
              <p className="text-sm font-medium leading-6 text-lc-text">{summary}</p>
            </div>

            <Field label="Plotter model">
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

            {plotter ? (
              <InfoRow
                label="Page size"
                value={`${plotter.page.widthMm} x ${plotter.page.heightMm} mm`}
              />
            ) : (
              <EmptyState>
                Add a plotter profile to enable G-code export and transport.
              </EmptyState>
            )}

            {studio.heightMesh.mesh ? (
              <InfoRow
                label="Height mesh"
                value={`${studio.heightMesh.mesh.grid.columns} x ${studio.heightMesh.mesh.grid.rows}${studio.heightMesh.deviceMismatch ? " (wrong plotter)" : ""}`}
              />
            ) : null}
          </section>

          <section className="grid gap-4 rounded-lc-control border border-lc-border bg-lc-panel p-4">
            <div className="grid gap-1">
              <h3 className="text-base font-semibold text-lc-text">Orientation</h3>
              <p className="text-sm leading-6 text-lc-text-secondary">
                Choose how the document should rotate before G-code generation.
              </p>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
              {exportRotationOptions.map((option) => {
                const selected =
                  studio.exportSettings.rotationDeg === option.value;

                return (
                  <button
                    key={String(option.value)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-lc-control border px-4 py-3 text-left text-sm font-medium transition-colors",
                      selected
                        ? "border-lc-primary bg-lc-primary-soft text-lc-primary-ink"
                        : "border-lc-border bg-lc-panel text-lc-text-secondary hover:bg-lc-panel-hover"
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

          <section className="grid gap-4 rounded-lc-control border border-lc-border bg-lc-panel p-4">
            <div className="grid gap-1">
              <h3 className="text-base font-semibold text-lc-text">Oversize handling</h3>
              <p className="text-sm leading-6 text-lc-text-secondary">
                Control what happens when the program canvas is larger than the plotter page.
              </p>
            </div>

            <div className="grid gap-2">
              {exportOversizeOptions.map((option) => {
                const selected = studio.exportSettings.oversizeHandling === option.value;

                return (
                  <button
                    key={option.value}
                    aria-pressed={selected}
                    className={cn(
                      "grid gap-1 rounded-lc-control border px-4 py-3 text-left transition-colors",
                      selected
                        ? "border-lc-primary bg-lc-primary-soft"
                        : "border-lc-border bg-lc-panel hover:bg-lc-panel-hover"
                    )}
                    type="button"
                    onClick={() => {
                      studio.setExportOversizeHandling(option.value);
                    }}
                  >
                    <span className="font-semibold text-lc-text">{option.label}</span>
                    <span className="text-sm leading-6 text-lc-text-secondary">{option.description}</span>
                  </button>
                );
              })}
            </div>

            <InfoRow
              label="Selected mode"
              value={formatOversizeHandlingLabel(studio.exportSettings.oversizeHandling)}
            />
            {!plotter ? (
              <Notice tone="warning">
                Pick a plotter profile before exporting or sending G-code.
              </Notice>
            ) : null}
          </section>

          <section className="grid gap-4 rounded-lc-control border border-lc-border bg-lc-panel p-4">
            <div className="grid gap-1">
              <h3 className="text-base font-semibold text-lc-text">Pen motion</h3>
              <p className="text-sm leading-6 text-lc-text-secondary">
                Choose whether pen lifts and drops are emitted as raw command blocks or as
                absolute Z-axis moves.
              </p>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
              {(["commands", "z-depth"] as const).map((mode) => {
                const selected = penMotion.mode === mode;

                return (
                  <button
                    key={mode}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-lc-control border px-4 py-3 text-left text-sm font-medium transition-colors",
                      selected
                        ? "border-lc-primary bg-lc-primary-soft text-lc-primary-ink"
                        : "border-lc-border bg-lc-panel text-lc-text-secondary hover:bg-lc-panel-hover"
                    )}
                    type="button"
                    onClick={() => {
                      if (penMotion.mode === mode) {
                        return;
                      }

                      studio.setExportPenMotion(penMotionDefaultsForMode(studio, mode));
                    }}
                  >
                    <span>{mode === "commands" ? "Commands" : "Z depth"}</span>
                  </button>
                );
              })}
            </div>

            {penMotion.mode === "commands" ? (
              <div className="grid gap-4">
                <Field
                  label="Pen up command"
                  hint="Sent between drawing segments and at document end unless disabled by the plotter profile."
                >
                  <Textarea
                    value={penMotion.penUpCommand}
                    onChange={(event) => {
                      studio.setExportPenMotion({
                        ...penMotion,
                        penUpCommand: event.currentTarget.value,
                      });
                    }}
                  />
                </Field>

                <Field
                  label="Pen down command"
                  hint="Sent after each travel move, right before drawing begins."
                >
                  <Textarea
                    value={penMotion.penDownCommand}
                    onChange={(event) => {
                      studio.setExportPenMotion({
                        ...penMotion,
                        penDownCommand: event.currentTarget.value,
                      });
                    }}
                  />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Pen up Z (mm)"
                  hint="Absolute safe travel height used while moving between paths."
                >
                  <Input
                    step="0.1"
                    type="number"
                    value={penMotion.penUpZMm}
                    onChange={(event) => {
                      const nextValue = Number(event.currentTarget.value);
                      if (!Number.isFinite(nextValue)) {
                        return;
                      }

                      studio.setExportPenMotion({
                        ...penMotion,
                        penUpZMm: nextValue,
                      });
                    }}
                  />
                </Field>

                <Field
                  label="Pen down Z (mm)"
                  hint="Base drawing depth before height-mesh compensation is added."
                >
                  <Input
                    step="0.1"
                    type="number"
                    value={penMotion.penDownZMm}
                    onChange={(event) => {
                      const nextValue = Number(event.currentTarget.value);
                      if (!Number.isFinite(nextValue)) {
                        return;
                      }

                      studio.setExportPenMotion({
                        ...penMotion,
                        penDownZMm: nextValue,
                      });
                    }}
                  />
                </Field>
              </div>
            )}

            <InfoRow label="Selected mode" value={formatPenMotionModeLabel(penMotion)} />
            {plotter?.gcode?.heightMeshCompensation?.enabled && penMotion.mode === "z-depth" ? (
              <Notice tone="info">
                Height-mesh offsets are added to the configured pen-down Z while drawing.
              </Notice>
            ) : null}
          </section>
        </div>

        <div className="mt-5 flex justify-end border-t border-lc-border pt-5">
          <Button
            disabled={exportDisabled}
            variant="default"
            onClick={() => {
              void studio.exportGcode();
            }}
          >
            {studio.pendingExport === "gcode" ? "Exporting..." : "Export G-code"}
          </Button>
        </div>
      </div>
    </StudioModalFrame>
  );
}
