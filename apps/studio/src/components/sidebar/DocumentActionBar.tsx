import { useEffect, useRef, useState } from "react";
import { cx } from "../../lib/cx";

type DocumentActionBarProps = Readonly<{
  duplicateDisabled: boolean;
  deleteDisabled: boolean;
  note?: string;
  onDelete: () => void;
  onDuplicate: () => void;
  onReset: () => void;
  onSave: () => void;
  resetDisabled: boolean;
  saveDisabled: boolean;
}>;

export function DocumentActionBar({
  duplicateDisabled,
  deleteDisabled,
  note,
  onDelete,
  onDuplicate,
  onReset,
  onSave,
  resetDisabled,
  saveDisabled,
}: DocumentActionBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasMenuActions = !resetDisabled || !deleteDisabled;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="studio-document-actions">
      <div className="studio-document-actions__row">
        <button
          className="studio-button studio-button--primary"
          disabled={saveDisabled}
          type="button"
          onClick={onSave}
        >
          Save
        </button>

        <button
          className="studio-button"
          disabled={duplicateDisabled}
          type="button"
          onClick={onDuplicate}
        >
          Duplicate
        </button>

        <div ref={menuRef} className="studio-action-menu">
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="studio-button studio-action-menu__trigger"
            disabled={!hasMenuActions}
            type="button"
            onClick={() => {
              setMenuOpen((current) => !current);
            }}
          >
            More
          </button>

          {menuOpen ? (
            <div className="studio-action-menu__panel" role="menu">
              <button
                className="studio-action-menu__item"
                disabled={resetDisabled}
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onReset();
                }}
              >
                Reset to defaults
              </button>
              <button
                className={cx(
                  "studio-action-menu__item",
                  !deleteDisabled && "studio-action-menu__item--danger"
                )}
                disabled={deleteDisabled}
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                Delete parameter set
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {note ? <p className="studio-document-actions__note">{note}</p> : null}
    </div>
  );
}
