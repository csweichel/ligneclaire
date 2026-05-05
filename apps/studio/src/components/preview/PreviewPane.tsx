import { createPreviewLayout } from "@ligneclaire/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProgramDetails } from "@ligneclaire/node-runtime";
import { cx } from "../../lib/cx";
import type {
  AnyEditorProps,
  CurrentDocumentState,
  EditorComponent,
} from "../../types";

type PreviewPaneProps = Readonly<{
  programDetails: ProgramDetails | null;
  current: CurrentDocumentState | null;
  svg: string;
  editorComponent: EditorComponent | null;
  isRendering: boolean;
  setShowDebug: (value: boolean) => void;
  showDebug: boolean;
  updateParam: (key: string, value: number | boolean) => void;
  updateProgramState: (updater: (current: unknown) => unknown) => void;
}>;

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const fallbackCanvas = {
  widthMm: 420,
  heightMm: 297,
  marginMm: 10,
} as const;

export function PreviewPane({
  programDetails,
  current,
  svg,
  editorComponent,
  isRendering,
  setShowDebug,
  showDebug,
  updateParam,
  updateProgramState,
}: PreviewPaneProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const canvas = programDetails?.canvas ?? fallbackCanvas;

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [programDetails?.id]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === previewRef.current) {
          setPreviewSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });

    if (previewRef.current) {
      observer.observe(previewRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const previewLayout = useMemo(
    () =>
      createPreviewLayout(canvas, previewSize, {
        zoom,
        panX: pan.x,
        panY: pan.y,
      }),
    [canvas, previewSize, zoom, pan]
  );

  const hasInteractiveEditor = Boolean(editorComponent && current && programDetails);

  return (
    <section className="preview-pane">
      <div className="preview-pane__header">
        <div className="preview-pane__copy">
          <p className="studio-eyebrow">Preview</p>
          <p className="preview-pane__description">
            {programDetails?.description ?? "Render output"}
          </p>
        </div>

        <div className="preview-pane__status">
          {hasInteractiveEditor ? (
            <span className="preview-pane__badge">Editor overlay active</span>
          ) : null}
          {isRendering ? <span className="preview-pane__badge">Rendering</span> : null}
          <button
            aria-pressed={showDebug}
            className={cx(
              "preview-pane__toggle",
              showDebug && "preview-pane__toggle--active"
            )}
            type="button"
            onClick={() => {
              setShowDebug(!showDebug);
            }}
          >
            Debug
          </button>
        </div>
      </div>

      <div
        ref={previewRef}
        className="preview-stage"
        onLostPointerCapture={() => {
          setPanning(false);
        }}
        onPointerDown={(event) => {
          if (
            (event.target as HTMLElement).closest("[data-editor-root='true']") ||
            (event.target as HTMLElement).closest("[data-preview-control='true']")
          ) {
            return;
          }

          setPanning(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!panning) {
            return;
          }

          setPan((currentPan) => ({
            x: currentPan.x + event.movementX,
            y: currentPan.y + event.movementY,
          }));
        }}
        onPointerUp={() => {
          setPanning(false);
        }}
        onWheel={(event) => {
          event.preventDefault();
          setZoom((currentZoom) =>
            Math.max(0.45, Math.min(4.5, currentZoom - event.deltaY * 0.001))
          );
        }}
      >
        <div
          className="preview-paper"
          style={{
            left: `${previewLayout.originX}px`,
            top: `${previewLayout.originY}px`,
            width: `${previewLayout.paperWidth}px`,
            height: `${previewLayout.paperHeight}px`,
          }}
        >
          {svg ? (
            <img
              alt="Plot preview"
              className="preview-paper__image"
              src={svgDataUrl(svg)}
            />
          ) : (
            <div className="preview-paper__placeholder">
              {programDetails
                ? isRendering
                  ? "Rendering preview..."
                  : "Preview will appear here."
                : "Select a program to start rendering."}
            </div>
          )}

          {editorComponent && current && programDetails ? (
            <div data-editor-root="true" className="preview-paper__editor">
              <EditorHost
                canvas={programDetails.canvas}
                component={editorComponent}
                current={current}
                preview={previewLayout.bridge}
                updateParam={updateParam}
                updateProgramState={updateProgramState}
              />
            </div>
          ) : null}
        </div>

        <div className="preview-stage__toolbar" data-preview-control="true">
          <button
            className="studio-button studio-button--compact"
            type="button"
            onClick={() => {
              setZoom((currentZoom) => Math.max(0.45, currentZoom - 0.15));
            }}
          >
            -
          </button>
          <button
            className="studio-button studio-button--compact"
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            Reset view
          </button>
          <button
            className="studio-button studio-button--compact"
            type="button"
            onClick={() => {
              setZoom((currentZoom) => Math.min(4.5, currentZoom + 0.15));
            }}
          >
            +
          </button>
        </div>
      </div>
    </section>
  );
}

type EditorHostProps = Readonly<{
  component: EditorComponent;
  canvas: ProgramDetails["canvas"];
  current: CurrentDocumentState;
  preview: AnyEditorProps["preview"];
  updateParam: (key: string, value: number | boolean) => void;
  updateProgramState: (updater: (current: unknown) => unknown) => void;
}>;

function EditorHost({
  component: EditorComponent,
  canvas,
  current,
  preview,
  updateParam,
  updateProgramState,
}: EditorHostProps) {
  return (
    <EditorComponent
      canvas={canvas}
      params={current.params}
      preview={preview}
      programState={current.programState}
      setParam={(key, value) => {
        updateParam(String(key), value);
      }}
      updateProgramState={(updater) => {
        updateProgramState((existing) => updater(existing));
      }}
    />
  );
}
