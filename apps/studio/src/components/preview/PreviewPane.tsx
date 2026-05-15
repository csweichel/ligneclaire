import {
  Badge,
  Button,
  cn,
  createPreviewLayout,
  ProgramEditorSurfacesProvider,
} from "@ligneclaire/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProgramDetails } from "@ligneclaire/node-runtime";
import type {
  AnyEditorProps,
  CurrentDocumentState,
  EditorComponent,
} from "../../types";
import { Eyebrow } from "../common/StudioPrimitives";

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
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-lc-app">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-6">
        <div className="grid gap-1">
          <Eyebrow>Preview</Eyebrow>
          <p className="text-sm leading-6 text-lc-text-secondary">
            {programDetails?.description ?? "Render output"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasInteractiveEditor ? (
            <Badge variant="default">
              {showEditorControls ? "Editor controls visible" : "Editor controls hidden"}
            </Badge>
          ) : null}
          {isRendering ? <Badge variant="accent">Rendering</Badge> : null}
          {hasInteractiveEditor ? (
            <Button
              aria-pressed={showEditorControls}
              size="sm"
              variant={showEditorControls ? "default" : "outline"}
              onClick={() => {
                setShowEditor(!showEditorControls);
              }}
            >
              Editor
            </Button>
          ) : null}
          <Button
            aria-pressed={showDebug}
            size="sm"
            variant={showDebug ? "default" : "outline"}
            onClick={() => {
              setShowDebug(!showDebug);
            }}
          >
            Debug
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid min-h-0 min-w-0 grid-cols-1 overflow-hidden border-t border-lc-border",
          showEditorControls && "xl:grid-cols-[minmax(0,1fr)_340px]"
        )}
      >
        <div
          ref={previewRef}
          className="relative min-h-[520px] min-w-0 overflow-hidden xl:min-h-0"
          style={{
            background:
              "linear-gradient(var(--studio-grid) 1px, transparent 1px), linear-gradient(90deg, var(--studio-grid) 1px, transparent 1px), linear-gradient(180deg, var(--studio-workspace-soft) 0%, var(--studio-workspace) 100%)",
            backgroundSize: "32px 32px, 32px 32px, 100% 100%",
          }}
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
              className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-lc-control border border-lc-border bg-lc-panel p-1 shadow-lc-recessed"
              data-preview-control="true"
              role="tablist"
            >
              <Button
                aria-selected={showPreviewSurface}
                aria-pressed={showPreviewSurface}
                role="tab"
                size="sm"
                variant={showPreviewSurface ? "default" : "ghost"}
                onClick={() => {
                  setActiveEditorSurface("preview");
                }}
              >
                Preview
              </Button>
              <Button
                aria-selected={showWorkspaceSurface}
                aria-pressed={showWorkspaceSurface}
                role="tab"
                size="sm"
                variant={showWorkspaceSurface ? "default" : "ghost"}
                onClick={() => {
                  setActiveEditorSurface("workspace");
                }}
              >
                {workspaceTabLabel}
              </Button>
            </div>
          ) : null}

          <div
            aria-hidden={!showPreviewSurface}
            className={cn("absolute inset-0", !showPreviewSurface && "hidden")}
          >
            <div
              className="absolute overflow-hidden rounded-lc-shell border border-lc-border bg-lc-panel"
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
                  className="absolute inset-0 h-full w-full overflow-hidden [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                  dangerouslySetInnerHTML={{
                    __html: inlineSvgMarkup(svg),
                  }}
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-lc-text-secondary">
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
                  className="pointer-events-none absolute inset-0 z-[2]"
                />
              ) : null}
            </div>

            <div
              className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-lc-control border border-lc-border bg-lc-panel p-2 shadow-lc-recessed"
              data-preview-control="true"
            >
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setZoom((currentZoom) => Math.max(0.45, currentZoom - 0.15));
                }}
              >
                -
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                Reset view
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setZoom((currentZoom) => Math.min(4.5, currentZoom + 0.15));
                }}
              >
                +
              </Button>
            </div>
          </div>

          <div
            aria-hidden={!showWorkspaceSurface}
            className={cn(
              "absolute inset-0 hidden overflow-hidden p-4",
              showWorkspaceSurface && "block",
              showWorkspaceTab && "pt-16"
            )}
            data-preview-control="true"
          >
            <div ref={setEditorWorkspaceRoot} className="h-full w-full min-h-0 min-w-0 overflow-hidden" />
          </div>
        </div>

        {showEditorControls ? (
          <aside
            ref={setEditorPanelRoot}
            className="min-h-0 min-w-0 overflow-auto border-t border-lc-border bg-lc-panel-muted xl:border-l xl:border-t-0"
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
