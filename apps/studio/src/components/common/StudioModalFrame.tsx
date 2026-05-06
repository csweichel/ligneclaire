import { useEffect, type ReactNode } from "react";
import { cx } from "../../lib/cx";

type StudioModalFrameProps = Readonly<{
  bodyClassName?: string;
  children: ReactNode;
  eyebrow?: string;
  onClose: () => void;
  surfaceClassName?: string;
  title: string;
}>;

export function StudioModalFrame({
  bodyClassName,
  children,
  eyebrow,
  onClose,
  surfaceClassName,
  title,
}: StudioModalFrameProps) {
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
        className={cx("studio-modal__surface", surfaceClassName)}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="studio-modal__header">
          <div className="studio-modal__copy">
            {eyebrow ? <p className="studio-eyebrow">{eyebrow}</p> : null}
            <h2 className="studio-modal__title">{title}</h2>
          </div>

          <button
            aria-label={`Close ${title}`}
            className="studio-button studio-button--compact"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className={cx("studio-modal__body", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}
