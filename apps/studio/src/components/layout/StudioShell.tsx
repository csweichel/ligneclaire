import { useState } from "react";
import type { StudioModel } from "../../types";
import { StudioHeader } from "../header/StudioHeader";
import { PreviewPane } from "../preview/PreviewPane";
import { StudioSidebar } from "../sidebar/StudioSidebar";
import { GcodeTransportModal } from "../transport/GcodeTransportModal";
import { StudioWorkspace } from "../workspace/StudioWorkspace";

type StudioShellProps = Readonly<{
  studio: StudioModel;
}>;

export function StudioShell({ studio }: StudioShellProps) {
  const [transportModalOpen, setTransportModalOpen] = useState(false);

  return (
    <div className="studio-shell">
      <StudioHeader
        studio={studio}
        onOpenTransportModal={() => {
          setTransportModalOpen(true);
        }}
      />

      <StudioWorkspace
        editor={<StudioSidebar studio={studio} />}
        preview={
          <PreviewPane
            current={studio.current}
            editorComponent={studio.editorComponent}
            isRendering={studio.isRendering}
            programDetails={studio.programDetails}
            setShowEditor={studio.setShowEditor}
            setShowDebug={studio.setShowDebug}
            showEditor={studio.showEditor}
            showDebug={studio.showDebug}
            svg={studio.svg}
            updateParam={studio.updateParam}
            updateProgramState={studio.updateProgramState}
          />
        }
      />

      {transportModalOpen ? (
        <GcodeTransportModal
          studio={studio}
          onClose={() => {
            setTransportModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
