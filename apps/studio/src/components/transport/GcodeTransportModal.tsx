import { useEffect } from "react";
import type { StudioModel } from "../../types";
import { GcodeTransportPanel } from "./GcodeTransportPanel";

type GcodeTransportModalProps = Readonly<{
  onClose: () => void;
  studio: StudioModel;
}>;

export function GcodeTransportModal({
  onClose,
  studio,
}: GcodeTransportModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="studio-modal"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="studio-modal__surface"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="studio-modal__header">
          <div className="studio-modal__copy">
            <p className="studio-eyebrow">Transport</p>
            <h2 className="studio-modal__title">Send G-code</h2>
          </div>

          <button
            aria-label="Close transport dialog"
            className="studio-button studio-button--compact"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="studio-modal__body">
          <GcodeTransportPanel studio={studio} />
        </div>
      </div>
    </div>
  );
}
