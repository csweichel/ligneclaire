import { cn } from "@ligneclaire/ui";
import type { StudioModel } from "../../types";
import { formatExportSettingsSummary } from "../../lib/exportSettings";

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
      className={cn(
        "grid gap-1 rounded-lc-control border border-lc-border bg-lc-panel px-4 py-3 text-left transition hover:bg-lc-panel-hover",
        fullWidth && "w-full",
        className
      )}
      type="button"
      onClick={onClick}
    >
      <span className="font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary">
        G-code settings
      </span>
      <span className="text-sm font-medium leading-6 text-lc-text">{summary}</span>
    </button>
  );
}
