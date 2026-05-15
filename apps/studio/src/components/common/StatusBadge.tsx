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
    <div className="flex min-h-10 min-w-0 items-center gap-3 rounded-lc-control border border-lc-border bg-lc-panel-subtle px-3 py-2">
      <Badge
        className={cn(
          "gap-2 border-none bg-transparent px-0 py-0 text-[11px] tracking-[0.14em]",
          tone === "default" && "text-lc-text-secondary",
          tone === "warning" && "text-lc-warning",
          tone === "success" && "text-lc-success",
          tone === "accent" && "text-lc-primary-ink",
          tone === "destructive" && "text-lc-danger"
        )}
        variant="default"
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            tone === "default" && "bg-lc-text-muted",
            tone === "warning" && "bg-lc-warning",
            tone === "success" && "bg-lc-success",
            tone === "accent" && "bg-lc-primary",
            tone === "destructive" && "bg-lc-danger"
          )}
        />
        {label}
      </Badge>
      <span className="min-w-0 truncate text-sm text-lc-text-secondary">{detail}</span>
    </div>
  );
}
