import type { ExportKind, StudioModel } from "../../types";
import { StatusBadge } from "../common/StatusBadge";

const studioLogoUrl = new URL("../../../../../Logo.png", import.meta.url).href;

type ExportAction = ExportKind | "send-gcode";

const exportKindLabels: Record<ExportAction, string> = {
  "raw-svg": "Raw SVG",
  "optimized-svg": "Optimized SVG",
  gcode: "G-code",
  "send-gcode": "Send G-code",
};

const exportOptions: readonly Readonly<{
  value: ExportAction;
  label: string;
}>[] = [
  { value: "raw-svg", label: "Raw SVG" },
  { value: "optimized-svg", label: "Optimized SVG" },
  { value: "gcode", label: "G-code..." },
  { value: "send-gcode", label: "Send G-code..." },
];

type StudioHeaderProps = Readonly<{
  onOpenExportSettingsModal: () => void;
  onOpenTransportModal: () => void;
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
  onOpenTransportModal,
  studio,
}: StudioHeaderProps) {
  const exportSelectDisabled =
    !studio.current ||
    studio.pendingExport !== null ||
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
        onOpenTransportModal();
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

      <div className="studio-topbar__controls">
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

        <StatusBadge
          dirty={studio.dirty}
          isRendering={studio.isRendering}
          status={studio.status}
        />
      </div>
    </header>
  );
}
