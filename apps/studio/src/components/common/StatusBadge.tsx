import { cx } from "../../lib/cx";
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
  let toneClass = "studio-status-badge--neutral";

  if (status.tone === "error") {
    label = "Error";
    detail = status.message;
    toneClass = "studio-status-badge--error";
  } else if (isRendering) {
    label = "Rendering";
    detail = "Updating preview";
    toneClass = "studio-status-badge--busy";
  } else if (dirty) {
    label = "Unsaved";
    detail = "Changes not saved";
    toneClass = "studio-status-badge--warning";
  } else if (status.tone === "success") {
    label = "Saved";
    detail = status.message;
    toneClass = "studio-status-badge--success";
  }

  return (
    <div className={cx("studio-status-badge", toneClass)}>
      <span className="studio-status-badge__state">
        <span className="studio-status-badge__dot" aria-hidden="true" />
        <span className="studio-status-badge__label">{label}</span>
      </span>
      <span className="studio-status-badge__detail">{detail}</span>
    </div>
  );
}
