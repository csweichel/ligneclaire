import { Button, Select, cn } from "@ligneclaire/ui";
import type { ExportKind, StudioModel, StudioPerspective } from "../../types";
import { InlineField } from "../common/StudioPrimitives";
import { StatusBadge } from "../common/StatusBadge";

const studioLogoUrl = new URL("../../../../../Logo.png", import.meta.url).href;

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
    <header className="flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-white/88 px-5 py-4 shadow-[0_28px_72px_-52px_rgba(15,23,42,0.45)] backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <h1 className="m-0 leading-none">
          <span className="sr-only">LigneClaire</span>
          <img
            className="block h-14 w-auto max-w-[min(240px,42vw)]"
            src={studioLogoUrl}
            alt=""
          />
        </h1>
      </div>

      <nav
        aria-label="Perspectives"
        className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-slate-200/80 bg-slate-50/90 p-1 shadow-inner shadow-slate-200/40"
      >
        <Button
          aria-pressed={perspective === "programs"}
          className={cn(
            "min-w-[8.5rem] rounded-full",
            perspective === "programs" && "shadow-sm"
          )}
          size="sm"
          variant={perspective === "programs" ? "default" : "ghost"}
          onClick={() => {
            onSelectPerspective("programs");
          }}
        >
          Programs
        </Button>
        <Button
          aria-pressed={perspective === "node-composer"}
          className={cn(
            "min-w-[9.5rem] rounded-full",
            perspective === "node-composer" && "shadow-sm"
          )}
          disabled={!nodeComposerAvailable}
          size="sm"
          variant={perspective === "node-composer" ? "default" : "ghost"}
          onClick={() => {
            onSelectPerspective("node-composer");
          }}
        >
          Node Composer
        </Button>
        <Button
          aria-pressed={perspective === "machine-control"}
          className={cn(
            "min-w-[9.5rem] rounded-full",
            perspective === "machine-control" && "shadow-sm"
          )}
          size="sm"
          variant={perspective === "machine-control" ? "default" : "ghost"}
          onClick={() => {
            onSelectPerspective("machine-control");
          }}
        >
          Machine Control
        </Button>
      </nav>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
        {perspective !== "machine-control" ? (
          <InlineField className="min-w-[13rem]" label="Export">
            <Select
              className="h-9 rounded-full bg-white"
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
