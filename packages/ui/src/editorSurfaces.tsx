import {
  createContext,
  forwardRef,
  useContext,
  type HTMLAttributes,
  type PropsWithChildren,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./lib/utils";

type EditorSurfaceRoots = Readonly<{
  canvasRoot: Element | DocumentFragment | null;
  panelRoot: Element | DocumentFragment | null;
  workspaceRoot: Element | DocumentFragment | null;
}>;

type ProgramEditorSurfacesProviderProps = PropsWithChildren<EditorSurfaceRoots>;
type SurfaceElementProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;
type SurfacePanelProps = PropsWithChildren<HTMLAttributes<HTMLElement>>;
type SurfaceWorkspaceProps = PropsWithChildren<
  HTMLAttributes<HTMLElement> &
    Readonly<{
      tabLabel?: string;
    }>
>;

const defaultRoots: EditorSurfaceRoots = {
  canvasRoot: null,
  panelRoot: null,
  workspaceRoot: null,
};

const editorSurfaceContext = createContext<EditorSurfaceRoots>(defaultRoots);

export function ProgramEditorSurfacesProvider({
  canvasRoot,
  panelRoot,
  workspaceRoot,
  children,
}: ProgramEditorSurfacesProviderProps) {
  return (
    <editorSurfaceContext.Provider
      value={{
        canvasRoot,
        panelRoot,
        workspaceRoot,
      }}
    >
      {children}
    </editorSurfaceContext.Provider>
  );
}

export const ProgramEditorCanvas = forwardRef<HTMLDivElement, SurfaceElementProps>(
  function ProgramEditorCanvas({ children, className, ...props }, ref) {
    const { canvasRoot } = useContext(editorSurfaceContext);
    const element = (
      <div
        {...props}
        ref={ref}
        className={cn("pointer-events-none absolute inset-0", className)}
      >
        {children}
      </div>
    );

    return canvasRoot ? createPortal(element, canvasRoot) : element;
  }
);

export function ProgramEditorPanel({
  children,
  className,
  ...props
}: SurfacePanelProps) {
  const { panelRoot } = useContext(editorSurfaceContext);
  const element = (
    <section
      {...props}
      className={cn(
        "flex min-h-full flex-col gap-4 px-5 py-5 text-slate-900",
        className
      )}
    >
      {children}
    </section>
  );

  return panelRoot ? createPortal(element, panelRoot) : element;
}

export function ProgramEditorWorkspace({
  children,
  className,
  tabLabel,
  ...props
}: SurfaceWorkspaceProps) {
  const { workspaceRoot } = useContext(editorSurfaceContext);
  const element = (
    <section
      {...props}
      data-editor-workspace="true"
      data-tab-label={tabLabel}
      className={cn(
        "grid h-full min-h-0 w-full overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/75 p-4 shadow-inner shadow-slate-200/40 backdrop-blur-sm",
        className
      )}
    >
      {children}
    </section>
  );

  return workspaceRoot ? createPortal(element, workspaceRoot) : element;
}
