import { Badge, cn } from "@ligneclaire/ui";
import type { StudioStatus } from "../../types";

type StatusBadgeProps = Readonly<{
  dirty: boolean;
  isRendering: boolean;
  status: StudioStatus;
}>;

export function StatusBadge({
  dirty,
  isRendering,
  status,
}: StatusBadgeProps) {
  let label = "Saved";
  let detail = "All changes saved";
  let tone: "default" | "warning" | "success" | "accent" | "destructive" = "default";

  if (status.tone === "error") {
    label = "Error";
    detail = status.message;
    tone = "destructive";
  } else if (isRendering) {
    label = "Rendering";
    detail = "Updating preview";
    tone = "accent";
  } else if (dirty) {
    label = "Unsaved";
    detail = "Changes not saved";
    tone = "warning";
  } else if (status.tone === "success") {
    label = "Saved";
    detail = status.message;
    tone = "success";
  }

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 shadow-sm shadow-slate-900/5">
      <Badge
        className={cn(
          "gap-2 border-none px-0 py-0 text-[11px] tracking-[0.16em]",
          tone === "default" && "bg-transparent text-slate-600",
          tone === "warning" && "bg-transparent text-amber-700",
          tone === "success" && "bg-transparent text-emerald-700",
          tone === "accent" && "bg-transparent text-indigo-700",
          tone === "destructive" && "bg-transparent text-rose-700"
        )}
        variant="default"
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            tone === "default" && "bg-slate-300",
            tone === "warning" && "bg-amber-400",
            tone === "success" && "bg-emerald-400",
            tone === "accent" && "bg-indigo-500",
            tone === "destructive" && "bg-rose-500"
          )}
        />
        {label}
      </Badge>
      <span className="min-w-0 truncate text-sm text-slate-500">{detail}</span>
    </div>
  );
}
