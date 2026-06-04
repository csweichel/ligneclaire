import { useEffect, useState } from "react";
import type { StudioModel, StudioPerspective } from "../../types";
import { ExportSettingsModal } from "../export/ExportSettingsModal";
import { StudioHeader } from "../header/StudioHeader";
import { MachineControlPerspective } from "../machine/MachineControlPerspective";
import { PreviewPane } from "../preview/PreviewPane";
import { StudioSidebar } from "../sidebar/StudioSidebar";
import { NodeComposerDocumentBar } from "../workspace/NodeComposerDocumentBar";
import { StudioWorkspace } from "../workspace/StudioWorkspace";

type StudioShellProps = Readonly<{
  studio: StudioModel;
}>;

export function StudioShell({ studio }: StudioShellProps) {
  const [exportSettingsModalOpen, setExportSettingsModalOpen] = useState(false);
  const [perspective, setPerspective] = useState<StudioPerspective>(() =>
    studio.selectedProgramId === "node-composer" ? "node-composer" : "programs"
  );
  const preventPageUnload =
    studio.transport.jobState === "sending" || studio.transport.jobState === "paused";
  const nodeComposerAvailable = studio.programs.some((program) => program.id === "node-composer");
  const defaultProgramId =
    studio.programs.find((program) => program.id !== "node-composer")?.id ?? null;

  useEffect(() => {
    if (
      perspective === "node-composer" &&
      nodeComposerAvailable &&
      studio.selectedProgramId !== "node-composer"
    ) {
      void studio.selectProgram("node-composer");
    }
  }, [nodeComposerAvailable, perspective, studio.selectProgram, studio.selectedProgramId]);

  useEffect(() => {
    if (
      perspective === "programs" &&
      studio.selectedProgramId === "node-composer" &&
      defaultProgramId
    ) {
      void studio.selectProgram(defaultProgramId);
    }
  }, [defaultProgramId, perspective, studio.selectProgram, studio.selectedProgramId]);

  useEffect(() => {
    if (
      perspective === "machine-control" &&
      studio.transport.settings.target !== "serial"
    ) {
      studio.transport.setTarget("serial");
    }
  }, [perspective, studio.transport.setTarget, studio.transport.settings.target]);

  useEffect(() => {
    if (!preventPageUnload) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [preventPageUnload]);

  function selectPerspective(nextPerspective: StudioPerspective): void {
    if (nextPerspective === "node-composer" && !nodeComposerAvailable) {
      return;
    }

    setPerspective(nextPerspective);
  }

  function handleProgramSelection(programId: string): void {
    setPerspective(programId === "node-composer" ? "node-composer" : "programs");
  }

  const previewPane = (
    <PreviewPane
      current={studio.current}
      editorComponent={studio.editorComponent}
      isRendering={studio.isRendering}
      previewCanvas={studio.previewCanvas}
      programDetails={studio.programDetails}
      setShowEditor={studio.setShowEditor}
      setShowDebug={studio.setShowDebug}
      showEditor={studio.showEditor}
      showDebug={studio.showDebug}
      svg={studio.svg}
      updateParam={studio.updateParam}
      updateProgramState={studio.updateProgramState}
    />
  );

  return (
    <div className="grid h-full min-h-0 max-w-full grid-rows-[auto_minmax(0,1fr)] bg-lc-app max-[1100px]:h-auto max-[1100px]:min-h-screen">
      <StudioHeader
        perspective={perspective}
        studio={studio}
        onSelectPerspective={selectPerspective}
        onOpenExportSettingsModal={() => {
          setExportSettingsModalOpen(true);
        }}
      />

      {perspective === "machine-control" ? (
        <MachineControlPerspective studio={studio} />
      ) : (
        <StudioWorkspace
          editor={
            perspective === "node-composer" ? null : (
              <StudioSidebar
                showDocumentControls
                showProgramSelector
                studio={studio}
                onSelectProgram={handleProgramSelection}
              />
            )
          }
          preview={
            perspective === "node-composer" ? (
              <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                <NodeComposerDocumentBar studio={studio} />
                <div className="min-h-0">{previewPane}</div>
              </div>
            ) : (
              previewPane
            )
          }
        />
      )}

      {exportSettingsModalOpen ? (
        <ExportSettingsModal
          studio={studio}
          onClose={() => {
            setExportSettingsModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
