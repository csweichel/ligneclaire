import {
  createContext,
  forwardRef,
  useContext,
  type HTMLAttributes,
  type PropsWithChildren,
} from "react";
import { createPortal } from "react-dom";

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

function joinClassNames(...values: Array<string | undefined>): string | undefined {
  const className = values.filter(Boolean).join(" ");
  return className.length > 0 ? className : undefined;
}

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
        className={joinClassNames("lc-editor-root", className)}
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
      className={joinClassNames("lc-editor-panel", className)}
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
      className={joinClassNames("lc-editor-workspace", className)}
    >
      {children}
    </section>
  );

  return workspaceRoot ? createPortal(element, workspaceRoot) : element;
}
