import { useState } from "react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  cn,
} from "@ligneclaire/ui";
import type { StudioModel } from "../../types";
import { Field } from "../common/StudioPrimitives";

type NodeComposerDocumentBarProps = Readonly<{
  studio: StudioModel;
}>;

export function NodeComposerDocumentBar({
  studio,
}: NodeComposerDocumentBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const savedParamSetSelected = Boolean(
    studio.current &&
      studio.paramSetList.items.some((item) => item.slug === studio.current?.slug)
  );
  const selectedParamSet = studio.paramSetList.items.find(
    (item) => item.slug === studio.current?.slug
  );
  const renamePending = Boolean(
    savedParamSetSelected &&
      studio.current &&
      selectedParamSet &&
      selectedParamSet.name !== studio.current.name.trim()
  );
  const nameMissing = Boolean(studio.current && studio.current.name.trim().length === 0);
  const saveDisabled = Boolean(
    !studio.current || nameMissing || (savedParamSetSelected && !studio.dirty)
  );
  const actionNote = nameMissing
    ? "Name is required before this composition can be saved."
    : !studio.current
      ? undefined
      : !savedParamSetSelected
        ? "Save to create a new composition from the current values."
        : renamePending
          ? "Saving will apply the new name to this composition."
          : studio.dirty
            ? "Unsaved changes."
            : undefined;
  const hasMenuActions = Boolean(studio.current) || savedParamSetSelected;

  return (
    <section className="border-b border-lc-border bg-lc-panel px-5 py-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,18rem)_minmax(0,22rem)_minmax(0,1fr)] xl:items-end">
        <Field label="Composition">
          <div className="flex gap-2 max-sm:flex-col">
            <Select
              disabled={!studio.current && studio.paramSetList.items.length === 0}
              value={studio.current?.slug ?? ""}
              onChange={(event) => {
                void studio.selectParamSet(event.currentTarget.value);
              }}
            >
              {studio.paramSetList.items.length > 0 ? (
                studio.paramSetList.items.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))
              ) : (
                <option value={studio.current?.slug ?? ""}>Unsaved defaults</option>
              )}
            </Select>

            <Button
              className="shrink-0"
              variant="outline"
              onClick={() => {
                void studio.createFromCurrent();
              }}
            >
              New
            </Button>
          </div>
        </Field>

        <Field label="Name">
          <Input
            disabled={!studio.current}
            placeholder="Untitled"
            type="text"
            value={studio.current?.name ?? ""}
            onChange={(event) => {
              studio.setCurrentName(event.currentTarget.value);
            }}
          />
        </Field>

        <div className="grid gap-2 xl:justify-items-end">
          <div className="flex flex-wrap gap-2 max-sm:flex-col">
            <Button
              disabled={saveDisabled}
              variant="default"
              onClick={() => {
                void studio.saveCurrent();
              }}
            >
              Save
            </Button>

            <Button
              disabled={!savedParamSetSelected}
              onClick={() => {
                void studio.duplicateCurrent();
              }}
            >
              Duplicate
            </Button>

            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  aria-expanded={menuOpen}
                  aria-haspopup="dialog"
                  disabled={!hasMenuActions}
                  variant="outline"
                >
                  More
                </Button>
              </PopoverTrigger>

              <PopoverContent align="end" className="grid gap-2 p-2">
                <Button
                  className="justify-start"
                  disabled={!studio.current}
                  variant="ghost"
                  onClick={() => {
                    setMenuOpen(false);
                    studio.resetToDefaults();
                  }}
                >
                  Reset to defaults
                </Button>
                <Button
                  className={cn("justify-start", savedParamSetSelected && "text-lc-danger")}
                  disabled={!savedParamSetSelected}
                  variant="ghost"
                  onClick={() => {
                    setMenuOpen(false);
                    void studio.deleteCurrent();
                  }}
                >
                  Delete composition
                </Button>
              </PopoverContent>
            </Popover>
          </div>

          {actionNote ? (
            <p className="text-sm leading-6 text-lc-text-secondary xl:max-w-[28rem] xl:text-right">
              {actionNote}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
