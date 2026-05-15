import { useState } from "react";
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "@ligneclaire/ui";

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
  const hasMenuActions = !resetDisabled || !deleteDisabled;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2 max-sm:flex-col">
        <Button
          className="flex-1"
          disabled={saveDisabled}
          variant="default"
          onClick={onSave}
        >
          Save
        </Button>

        <Button
          className="flex-1"
          disabled={duplicateDisabled}
          onClick={onDuplicate}
        >
          Duplicate
        </Button>

        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              className="flex-1"
              disabled={!hasMenuActions}
              variant="outline"
            >
              More
            </Button>
          </PopoverTrigger>

          <PopoverContent align="end" className="grid gap-2 p-2">
            <Button
              className="justify-start"
              disabled={resetDisabled}
              variant="ghost"
              onClick={() => {
                setMenuOpen(false);
                onReset();
              }}
            >
              Reset to defaults
            </Button>
            <Button
              className={cn("justify-start", !deleteDisabled && "text-rose-700")}
              disabled={deleteDisabled}
              variant="ghost"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              Delete parameter set
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {note ? <p className="text-sm leading-6 text-slate-500">{note}</p> : null}
    </div>
  );
}
