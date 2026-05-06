import type { StudioModel } from "../../types";
import { formatExportSettingsSummary } from "../../lib/exportSettings";
import { cx } from "../../lib/cx";

type ExportSettingsButtonProps = Readonly<{
  className?: string;
  fullWidth?: boolean;
  onClick: () => void;
  studio: StudioModel;
}>;

export function ExportSettingsButton({
  className,
  fullWidth = false,
  onClick,
  studio,
}: ExportSettingsButtonProps) {
  const summary = formatExportSettingsSummary(
    studio.exportSettings,
    studio.plotters,
    studio.programDetails?.canvas
  );

  return (
    <button
      className={cx(
        "studio-settings-button",
        fullWidth && "studio-settings-button--full",
        className
      )}
      type="button"
      onClick={onClick}
    >
      <span className="studio-settings-button__label">G-code settings</span>
      <span className="studio-settings-button__summary">{summary}</span>
    </button>
  );
}
