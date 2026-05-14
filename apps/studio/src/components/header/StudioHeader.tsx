import type { ExportKind, StudioModel, StudioPerspective } from "../../types";
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
    <header className="studio-topbar">
      <div className="studio-topbar__brand">
        <h1 className="studio-topbar__title">
          <span className="studio-visually-hidden">LigneClaire</span>
          <img className="studio-topbar__logo" src={studioLogoUrl} alt="" />
        </h1>
      </div>

      <nav aria-label="Perspectives" className="studio-topbar__perspectives">
        <button
          aria-pressed={perspective === "programs"}
          className={`studio-topbar__perspective${perspective === "programs" ? " studio-topbar__perspective--active" : ""}`}
          type="button"
          onClick={() => {
            onSelectPerspective("programs");
          }}
        >
          Programs
        </button>
        <button
          aria-pressed={perspective === "node-composer"}
          className={`studio-topbar__perspective${perspective === "node-composer" ? " studio-topbar__perspective--active" : ""}`}
          disabled={!nodeComposerAvailable}
          type="button"
          onClick={() => {
            onSelectPerspective("node-composer");
          }}
        >
          Node Composer
        </button>
        <button
          aria-pressed={perspective === "machine-control"}
          className={`studio-topbar__perspective${perspective === "machine-control" ? " studio-topbar__perspective--active" : ""}`}
          type="button"
          onClick={() => {
            onSelectPerspective("machine-control");
          }}
        >
          Machine Control
        </button>
      </nav>

      <div className="studio-topbar__controls">
        {perspective !== "machine-control" ? (
          <label className="studio-inline-field">
            <span className="studio-inline-field__label">Export</span>
            <select
              className="studio-input studio-input--compact"
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
            </select>
          </label>
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
