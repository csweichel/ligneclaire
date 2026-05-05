import { useRef, useState, type ReactNode } from "react";
import { cx } from "../../lib/cx";

type StudioWorkspaceProps = Readonly<{
  preview: ReactNode;
  editor: ReactNode;
}>;

export function StudioWorkspace({
  preview,
  editor,
}: StudioWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.72);
  const [dragging, setDragging] = useState(false);

  function updateSplit(clientX: number): void {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const ratio = (clientX - rect.left) / rect.width;
    setSplitRatio(Math.max(0.56, Math.min(0.82, ratio)));
  }

  return (
    <div
      ref={workspaceRef}
      className="studio-workspace"
      style={{
        gridTemplateColumns: `minmax(0, ${splitRatio}fr) 10px minmax(320px, ${1 - splitRatio}fr)`,
      }}
    >
      <div className="studio-workspace__pane">{preview}</div>

      <div
        className={cx("studio-divider", dragging && "is-active")}
        role="separator"
        tabIndex={-1}
        onLostPointerCapture={() => {
          setDragging(false);
        }}
        onPointerDown={(event) => {
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          updateSplit(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!dragging) {
            return;
          }

          updateSplit(event.clientX);
        }}
        onPointerUp={() => {
          setDragging(false);
        }}
      />

      <div className="studio-workspace__pane">{editor}</div>
    </div>
  );
}
