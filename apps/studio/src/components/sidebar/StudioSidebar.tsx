import { ParameterInspector } from "@ligneclaire/ui";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Input,
  Select,
} from "@ligneclaire/ui";
import type { StudioModel } from "../../types";
import {
  EmptyState,
  Field,
  InfoRow,
  Notice,
  PanelCard,
} from "../common/StudioPrimitives";
import { DocumentActionBar } from "./DocumentActionBar";

type StudioSidebarProps = Readonly<{
  onSelectProgram?: (programId: string) => void;
  showDocumentControls?: boolean;
  showProgramSelector?: boolean;
  studio: StudioModel;
}>;

export function StudioSidebar({
  onSelectProgram,
  showDocumentControls = true,
  showProgramSelector = true,
  studio,
}: StudioSidebarProps) {
  const listedPrograms = studio.programs.filter((program) => program.id !== "node-composer");
  const selectedProgramId = listedPrograms.some((program) => program.id === studio.selectedProgramId)
    ? studio.selectedProgramId
    : (listedPrograms[0]?.id ?? "");
  const generatedParameterCount = studio.programDetails
    ? Object.keys(studio.programDetails.params).length
    : 0;
  const hasGeneratedParameters = generatedParameterCount > 0;
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
    ? "Name is required before this parameter set can be saved."
    : !studio.current
      ? undefined
      : !savedParamSetSelected
        ? "Save to create a new parameter set from the current values."
        : renamePending
          ? "Saving will apply the new name to this parameter set."
          : studio.dirty
            ? "Unsaved changes."
            : undefined;

  return (
    <aside className="h-full min-h-0 min-w-0 w-full">
      <PanelCard
        className="h-full min-h-0 w-full overflow-hidden"
        contentClassName="gap-4 p-4"
      >
        <div
          className={
            showDocumentControls
              ? "grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]"
              : "grid h-full min-h-0 grid-rows-[minmax(0,1fr)]"
          }
        >
          {showDocumentControls ? (
            <div className="grid gap-4 border-b border-slate-200/80 pb-5">
              {showProgramSelector && listedPrograms.length > 0 ? (
                <Field label="Program">
                  <Select
                    value={selectedProgramId}
                    onChange={(event) => {
                      const nextProgramId = event.currentTarget.value;
                      onSelectProgram?.(nextProgramId);
                      studio.selectProgram(nextProgramId);
                    }}
                  >
                    {listedPrograms.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              <Field label="Parameter set">
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

              <DocumentActionBar
                deleteDisabled={!savedParamSetSelected}
                duplicateDisabled={!savedParamSetSelected}
                note={actionNote}
                onDelete={() => {
                  void studio.deleteCurrent();
                }}
                onDuplicate={() => {
                  void studio.duplicateCurrent();
                }}
                onReset={() => {
                  studio.resetToDefaults();
                }}
                onSave={() => {
                  void studio.saveCurrent();
                }}
                resetDisabled={!studio.current}
                saveDisabled={saveDisabled}
              />

              {studio.localProgram?.editor ? (
                <Notice>
                  Interactive editor controls are available beside the preview page.
                </Notice>
              ) : null}
            </div>
          ) : null}

          <div
            className={
              showDocumentControls
                ? "grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4 overflow-hidden pt-5"
                : "grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4 overflow-hidden"
            }
          >
            <div className="min-h-0 overflow-auto">
              {studio.programDetails && studio.current ? (
                hasGeneratedParameters ? (
                  <ParameterInspector
                    schema={studio.programDetails.params}
                    values={studio.current.params}
                    onChange={studio.updateParam}
                  />
                ) : (
                  <EmptyState>
                    {studio.localProgram?.editor
                      ? "This program is configured from the interactive editor beside the preview page."
                      : "This program does not expose generated parameters."}
                  </EmptyState>
                )
              ) : (
                <EmptyState>
                  Load a program to inspect and adjust its generated controls.
                </EmptyState>
              )}
            </div>

            <Accordion
              className="grid gap-3 overflow-auto"
              defaultValue={[]}
              type="multiple"
            >
              <AccordionItem value="status">
                <AccordionTrigger>Status</AccordionTrigger>
                <AccordionContent className="grid gap-2 px-4 pb-4">
                  {studio.programDetails ? (
                    <InfoRow
                      label="Canvas"
                      value={`${studio.programDetails.canvas.widthMm} x ${studio.programDetails.canvas.heightMm} mm`}
                    />
                  ) : null}

                  {studio.paramSetList.invalid.length > 0 ? (
                    <Notice tone="warning">
                      {studio.paramSetList.invalid.length} invalid parameter set
                      {studio.paramSetList.invalid.length === 1 ? "" : "s"} ignored.
                    </Notice>
                  ) : null}

                  {studio.normalizationIssues.length > 0 ? (
                    <IssueBlock
                      items={studio.normalizationIssues.map((issue) => issue.message)}
                      title="Normalization"
                    />
                  ) : null}

                  {studio.validationIssues.length > 0 ? (
                    <IssueBlock
                      items={studio.validationIssues.map(
                        (issue) => `${issue.severity.toUpperCase()}: ${issue.message}`
                      )}
                      title="Geometry"
                    />
                  ) : null}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="metrics">
                <AccordionTrigger>Metrics</AccordionTrigger>
                <AccordionContent className="grid gap-2 px-4 pb-4">
                  <MetricRow label="Art layers" value={String(studio.metrics?.artLayerCount ?? "--")} />
                  <MetricRow label="Paths" value={String(studio.metrics?.pathCount ?? "--")} />
                  <MetricRow label="Segments" value={String(studio.metrics?.segmentCount ?? "--")} />
                  <MetricRow
                    label="Draw distance"
                    value={studio.metrics ? `${studio.metrics.drawDistanceMm.toFixed(1)} mm` : "--"}
                  />
                  <MetricRow
                    label="Pen-up distance"
                    value={studio.metrics ? `${studio.metrics.penUpDistanceMm.toFixed(1)} mm` : "--"}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="environment">
                <AccordionTrigger>Environment</AccordionTrigger>
                <AccordionContent className="grid gap-2 px-4 pb-4">
                  <MetricRow
                    label="vpype"
                    value={studio.tools?.vpype.available ? "Ready" : "Missing"}
                  />
                  <MetricRow
                    label="vpype-gcode"
                    value={studio.tools?.vpypeGcode.available ? "Ready" : "Missing"}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </PanelCard>
    </aside>
  );
}

type MetricRowProps = Readonly<{
  label: string;
  value: string;
}>;

function MetricRow({ label, value }: MetricRowProps) {
  return <InfoRow label={label} value={value} />;
}

type IssueBlockProps = Readonly<{
  title: string;
  items: readonly string[];
}>;

function IssueBlock({ title, items }: IssueBlockProps) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </h3>
      <ul className="grid gap-2 pl-4 text-sm leading-6 text-slate-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
