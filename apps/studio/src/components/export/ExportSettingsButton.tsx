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
        "grid gap-1 rounded-[22px] border border-slate-200/80 bg-white/90 px-4 py-3 text-left shadow-sm shadow-slate-900/5 transition hover:border-slate-300 hover:bg-white",
        fullWidth && "w-full",
        className
      )}
      type="button"
      onClick={onClick}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        G-code settings
      </span>
      <span className="text-sm font-medium leading-6 text-slate-900">{summary}</span>
    </button>
  );
}
