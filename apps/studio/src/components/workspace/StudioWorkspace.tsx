import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@ligneclaire/ui";

type StudioWorkspaceProps = Readonly<{
  preview: ReactNode;
  editor?: ReactNode;
}>;

export function StudioWorkspace({
  preview,
  editor,
}: StudioWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.28);
  const [dragging, setDragging] = useState(false);
  const hasEditor = editor !== null && editor !== undefined;
  const [stacked, setStacked] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia("(max-width: 1100px)").matches;
  });
  const separatorWidth = 10;
  const minEditorWidth = 320;
  const minPreviewWidth = 760;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 1100px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setStacked(event.matches);
    };

    setStacked(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  function updateSplit(clientX: number): void {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const availableWidth = Math.max(rect.width - separatorWidth, minEditorWidth + minPreviewWidth);
    const nextRatio = (clientX - rect.left) / availableWidth;
    const minRatio = minEditorWidth / availableWidth;
    const maxRatio = 1 - minPreviewWidth / availableWidth;

    setSplitRatio(Math.min(maxRatio, Math.max(minRatio, nextRatio)));
  }

  return (
    <div
      ref={workspaceRef}
      className="grid min-h-0 min-w-0 w-full flex-1 gap-0 bg-lc-panel"
      style={{
        gridTemplateColumns: stacked || !hasEditor
          ? "1fr"
          : `minmax(${minEditorWidth}px, ${splitRatio}fr) ${separatorWidth}px minmax(${minPreviewWidth}px, ${1 - splitRatio}fr)`,
      }}
    >
      {hasEditor ? (
        <>
          <div className="min-h-0 min-w-0 overflow-hidden">{editor}</div>

          <div
            className={cn(
              "group relative cursor-col-resize bg-gradient-to-b from-transparent via-lc-border to-transparent",
              stacked && "hidden",
              dragging && "via-lc-primary"
            )}
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
          >
            <div
              aria-hidden="true"
              className={cn(
                "absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lc-border-strong transition",
                "group-hover:bg-lc-primary/70",
                dragging && "bg-lc-primary"
              )}
            />
          </div>
        </>
      ) : null}

      <div className="min-h-0 min-w-0 overflow-hidden">{preview}</div>
    </div>
  );
}
