import { Button, Select, cn } from "@ligneclaire/ui";
import type { ExportKind, StudioModel, StudioPerspective } from "../../types";
import { InlineField } from "../common/StudioPrimitives";
import { StatusBadge } from "../common/StatusBadge";

type ExportAction = ExportKind | "send-gcode";

const exportKindLabels: Record<ExportAction, string> = {
  "raw-svg": "Raw SVG",
  "optimized-svg": "Optimized SVG",
  gcode: "G-code",
  "send-gcode": "Machine Control",
};

const exportOptions: readonly Readonly<{
  value: ExportAction;
  label: string;
}>[] = [
  { value: "raw-svg", label: "Raw SVG" },
  { value: "optimized-svg", label: "Optimized SVG" },
  { value: "gcode", label: "G-code..." },
  { value: "send-gcode", label: "Machine Control" },
];

type StudioHeaderProps = Readonly<{
  onOpenExportSettingsModal: () => void;
  onSelectPerspective: (perspective: StudioPerspective) => void;
  perspective: StudioPerspective;
  studio: StudioModel;
}>;

function isExportUnavailable(studio: StudioModel, kind: ExportAction): boolean {
  switch (kind) {
    case "raw-svg":
      return false;
    case "optimized-svg":
      return !studio.tools?.vpype.available;
    case "gcode":
    case "send-gcode":
      return !studio.tools?.vpypeGcode.available || !studio.exportSettings.deviceId;
  }
}

export function StudioHeader({
  onOpenExportSettingsModal,
  onSelectPerspective,
  perspective,
  studio,
}: StudioHeaderProps) {
  const nodeComposerAvailable = studio.programs.some((program) => program.id === "node-composer");
  const exportBusy =
    studio.pendingExport !== null ||
    studio.transport.jobState === "preparing" ||
    studio.transport.jobState === "sending" ||
    studio.transport.jobState === "paused";
  const exportSelectDisabled =
    !studio.current ||
    exportBusy ||
    exportOptions.every((option) => isExportUnavailable(studio, option.value));

  async function runExport(kind: ExportAction): Promise<void> {
    switch (kind) {
      case "raw-svg":
        await studio.exportRawSvg();
        return;
      case "optimized-svg":
        await studio.exportOptimizedSvg();
        return;
      case "gcode":
        onOpenExportSettingsModal();
        return;
      case "send-gcode":
        onSelectPerspective("machine-control");
        await studio.transport.prepare();
        return;
    }
  }

  return (
    <header className="grid gap-5 border-b border-lc-border bg-lc-panel px-5 py-5 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center">
      <div className="min-w-0 xl:justify-self-start">
        <h1 className="m-0 text-3xl font-semibold tracking-[-0.05em] text-lc-text">
          Ligne Claire
        </h1>
      </div>

      <nav
        aria-label="Perspectives"
        className="flex min-w-0 items-center gap-6 overflow-x-auto xl:justify-self-center"
      >
        <Button
          aria-pressed={perspective === "programs"}
          className={cn(
            "min-w-fit rounded-none border-x-0 border-t-0 border-b-2 px-0 pb-2 pt-1 font-lc-mono text-sm font-medium uppercase tracking-[0.12em] hover:bg-transparent",
            perspective === "programs"
              ? "border-lc-primary text-lc-primary"
              : "border-transparent text-lc-text-secondary hover:text-lc-text"
          )}
          size="sm"
          variant="ghost"
          onClick={() => {
            onSelectPerspective("programs");
          }}
        >
          Programs
        </Button>
        <Button
          aria-pressed={perspective === "node-composer"}
          className={cn(
            "min-w-fit rounded-none border-x-0 border-t-0 border-b-2 px-0 pb-2 pt-1 font-lc-mono text-sm font-medium uppercase tracking-[0.12em] hover:bg-transparent",
            perspective === "node-composer"
              ? "border-lc-primary text-lc-primary"
              : "border-transparent text-lc-text-secondary hover:text-lc-text"
          )}
          disabled={!nodeComposerAvailable}
          size="sm"
          variant="ghost"
          onClick={() => {
            onSelectPerspective("node-composer");
          }}
        >
          Node Composer
        </Button>
        <Button
          aria-pressed={perspective === "machine-control"}
          className={cn(
            "min-w-fit rounded-none border-x-0 border-t-0 border-b-2 px-0 pb-2 pt-1 font-lc-mono text-sm font-medium uppercase tracking-[0.12em] hover:bg-transparent",
            perspective === "machine-control"
              ? "border-lc-primary text-lc-primary"
              : "border-transparent text-lc-text-secondary hover:text-lc-text"
          )}
          size="sm"
          variant="ghost"
          onClick={() => {
            onSelectPerspective("machine-control");
          }}
        >
          Machine Control
        </Button>
      </nav>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 xl:justify-self-end">
        {perspective !== "machine-control" ? (
          <InlineField className="min-w-[13rem]" label="Export">
            <Select
              className="h-10 min-w-[10rem] bg-lc-panel"
              disabled={exportSelectDisabled}
              value=""
              onChange={(event) => {
                const kind = event.currentTarget.value as ExportAction | "";
                if (!kind) {
                  return;
                }

                event.currentTarget.value = "";
                void runExport(kind);
              }}
            >
              <option value="">
                {studio.pendingExport
                  ? `Exporting ${exportKindLabels[studio.pendingExport]}...`
                  : studio.transport.jobState === "preparing"
                    ? "Preparing G-code..."
                  : "Export"}
              </option>
              {exportOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={isExportUnavailable(studio, option.value)}
                >
                  {option.label}
                </option>
              ))}
            </Select>
          </InlineField>
        ) : null}

        <StatusBadge
          dirty={studio.dirty}
          isRendering={studio.isRendering}
          status={studio.status}
        />
      </div>
    </header>
  );
}
