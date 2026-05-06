import type { StudioModel } from "../../types";
import { StudioModalFrame } from "../common/StudioModalFrame";
import { GcodeTransportPanel } from "./GcodeTransportPanel";

type GcodeTransportModalProps = Readonly<{
  onClose: () => void;
  onOpenExportSettingsModal: () => void;
  studio: StudioModel;
}>;

export function GcodeTransportModal({
  onClose,
  onOpenExportSettingsModal,
  studio,
}: GcodeTransportModalProps) {
  return (
    <StudioModalFrame eyebrow="G-code" onClose={onClose} title="G-code">
      <GcodeTransportPanel
        studio={studio}
        onOpenExportSettingsModal={onOpenExportSettingsModal}
      />
    </StudioModalFrame>
  );
}
