import {
  createPreviewLayout,
  ProgramEditorSurfacesProvider,
} from "@ligneclaire/ui";
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
  setShowEditor: (value: boolean) => void;
  setShowDebug: (value: boolean) => void;
  showEditor: boolean;
  showDebug: boolean;
  updateParam: (key: string, value: number | boolean) => void;
  updateProgramState: (updater: (current: unknown) => unknown) => void;
}>;

function inlineSvgMarkup(svg: string): string {
  return svg.replace(/^<\?xml[^>]*\?>/, "");
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
  setShowEditor,
  setShowDebug,
  showEditor,
  showDebug,
  updateParam,
  updateProgramState,
}: PreviewPaneProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });
  const [editorCanvasRoot, setEditorCanvasRoot] = useState<HTMLDivElement | null>(null);
  const [editorPanelRoot, setEditorPanelRoot] = useState<HTMLElement | null>(null);
  const [editorWorkspaceRoot, setEditorWorkspaceRoot] = useState<HTMLElement | null>(null);
  const [workspaceTabLabel, setWorkspaceTabLabel] = useState("Editor");
  const [workspaceHasContent, setWorkspaceHasContent] = useState(false);
  const [didAutoOpenWorkspace, setDidAutoOpenWorkspace] = useState(false);
  const [activeEditorSurface, setActiveEditorSurface] = useState<"preview" | "workspace">(
    "preview"
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const canvas = programDetails?.canvas ?? fallbackCanvas;
  const hasInteractiveEditor = Boolean(editorComponent && current && programDetails);
  const showEditorControls = hasInteractiveEditor && showEditor;
  const editorCanvas = showEditorControls && programDetails ? programDetails.canvas : null;
  const editorInstance = showEditorControls ? editorComponent : null;
  const currentDocument = showEditorControls ? current : null;

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setWorkspaceHasContent(false);
    setWorkspaceTabLabel("Editor");
    setDidAutoOpenWorkspace(false);
    setActiveEditorSurface("preview");
  }, [programDetails?.id]);

  useEffect(() => {
    if (!showEditorControls) {
      setWorkspaceHasContent(false);
      setWorkspaceTabLabel("Editor");
      setDidAutoOpenWorkspace(false);
      setActiveEditorSurface("preview");
      return;
    }

    const root = editorWorkspaceRoot;
    if (!root) {
      return;
    }

    const syncWorkspaceState = () => {
      const workspaceElement = root.querySelector<HTMLElement>("[data-editor-workspace='true']");
      const hasContent = Boolean(workspaceElement);
      setWorkspaceHasContent(hasContent);
      setWorkspaceTabLabel(workspaceElement?.dataset.tabLabel ?? "Editor");
      if (!hasContent) {
        setDidAutoOpenWorkspace(false);
        setActiveEditorSurface("preview");
        return;
      }

      setDidAutoOpenWorkspace((alreadyOpened) => {
        if (!alreadyOpened) {
          setActiveEditorSurface("workspace");
          return true;
        }

        return alreadyOpened;
      });
    };

    syncWorkspaceState();

    const observer = new MutationObserver(() => {
      syncWorkspaceState();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tab-label"],
    });

    return () => {
      observer.disconnect();
    };
  }, [editorWorkspaceRoot, showEditorControls]);

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

  const showWorkspaceTab = showEditorControls && workspaceHasContent;
  const showPreviewSurface = !showWorkspaceTab || activeEditorSurface === "preview";
  const showWorkspaceSurface = showWorkspaceTab && activeEditorSurface === "workspace";

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
            <span className="preview-pane__badge">
              {showEditorControls ? "Editor controls visible" : "Editor controls hidden"}
            </span>
          ) : null}
          {isRendering ? <span className="preview-pane__badge">Rendering</span> : null}
          {hasInteractiveEditor ? (
            <button
              aria-pressed={showEditorControls}
              className={cx(
                "preview-pane__toggle",
                showEditorControls && "preview-pane__toggle--active"
              )}
              type="button"
              onClick={() => {
                setShowEditor(!showEditorControls);
              }}
            >
              Editor
            </button>
          ) : null}
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
        className={cx(
          "preview-pane__body",
          showEditorControls && "preview-pane__body--with-editor"
        )}
      >
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
          {showWorkspaceTab ? (
            <div
              aria-label="Preview surfaces"
              className="preview-stage__tabs"
              data-preview-control="true"
              role="tablist"
            >
              <button
                aria-selected={showPreviewSurface}
                aria-pressed={showPreviewSurface}
                className={cx(
                  "preview-pane__tab",
                  showPreviewSurface && "preview-pane__tab--active"
                )}
                role="tab"
                type="button"
                onClick={() => {
                  setActiveEditorSurface("preview");
                }}
              >
                Preview
              </button>
              <button
                aria-selected={showWorkspaceSurface}
                aria-pressed={showWorkspaceSurface}
                className={cx(
                  "preview-pane__tab",
                  showWorkspaceSurface && "preview-pane__tab--active"
                )}
                role="tab"
                type="button"
                onClick={() => {
                  setActiveEditorSurface("workspace");
                }}
              >
                {workspaceTabLabel}
              </button>
            </div>
          ) : null}

          <div
            aria-hidden={!showPreviewSurface}
            className={cx(
              "preview-stage__preview",
              !showPreviewSurface && "preview-stage__preview--hidden"
            )}
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
                <div
                  aria-label="Plot preview"
                  className="preview-paper__image"
                  dangerouslySetInnerHTML={{
                    __html: inlineSvgMarkup(svg),
                  }}
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

              {showEditorControls ? (
                <div
                  ref={setEditorCanvasRoot}
                  data-editor-root="true"
                  className="preview-paper__editor"
                />
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

          <div
            aria-hidden={!showWorkspaceSurface}
            className={cx(
              "preview-stage__workspace",
              showWorkspaceSurface && "preview-stage__workspace--active",
              showWorkspaceTab && "preview-stage__workspace--with-tabs"
            )}
            data-preview-control="true"
          >
            <div
              ref={setEditorWorkspaceRoot}
              className="preview-stage__workspace-root"
            />
          </div>
        </div>

        {showEditorControls ? (
          <aside
            ref={setEditorPanelRoot}
            className="preview-pane__editor-panel"
            data-preview-control="true"
          />
        ) : null}
      </div>

      {showEditorControls && editorCanvas && editorInstance && currentDocument ? (
        <EditorHost
          canvas={editorCanvas}
          canvasRoot={editorCanvasRoot}
          component={editorInstance}
          current={currentDocument}
          panelRoot={editorPanelRoot}
          preview={previewLayout.bridge}
          workspaceRoot={editorWorkspaceRoot}
          updateParam={updateParam}
          updateProgramState={updateProgramState}
        />
      ) : null}
    </section>
  );
}

type EditorHostProps = Readonly<{
  canvasRoot: HTMLDivElement | null;
  component: EditorComponent;
  canvas: ProgramDetails["canvas"];
  current: CurrentDocumentState;
  panelRoot: HTMLElement | null;
  preview: AnyEditorProps["preview"];
  workspaceRoot: HTMLElement | null;
  updateParam: (key: string, value: number | boolean) => void;
  updateProgramState: (updater: (current: unknown) => unknown) => void;
}>;

function EditorHost({
  canvasRoot,
  component: EditorComponent,
  canvas,
  current,
  panelRoot,
  preview,
  workspaceRoot,
  updateParam,
  updateProgramState,
}: EditorHostProps) {
  return (
    <ProgramEditorSurfacesProvider
      canvasRoot={canvasRoot}
      panelRoot={panelRoot}
      workspaceRoot={workspaceRoot}
    >
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
    </ProgramEditorSurfacesProvider>
  );
}
