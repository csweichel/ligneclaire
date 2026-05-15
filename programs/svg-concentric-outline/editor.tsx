import type { JSX } from "react";
import { useState } from "react";
import { ProgramEditorPanel } from "@ligneclaire/ui";
import type { ProgramEditorProps } from "@ligneclaire/sdk";
import {
  countSvgOutlinePoints,
  defaultSvgConcentricOutlineProgramState,
  type SvgConcentricOutlineProgramState,
  type SvgConcentricOutlineSchema,
} from "./index";
import { importSvgOutlineFile } from "./svgImport";

type Props = ProgramEditorProps<
  SvgConcentricOutlineSchema,
  SvgConcentricOutlineProgramState
>;

export default function SvgConcentricOutlineEditor({
  programState,
  updateProgramState,
}: Props): JSX.Element {
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  return (
    <ProgramEditorPanel>
      <div className="lc-editor-overlay__header">
        <p className="lc-editor-overlay__eyebrow">Program Editor</p>
        <h3 className="lc-editor-overlay__title">SVG Outline Import</h3>
      </div>

      <p className="lc-editor-overlay__copy">
        Upload an SVG with path or shape geometry. The imported outline is repeated and scaled
        around its centroid to create nested draw paths.
      </p>

      <label className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">
          SVG file
          <span className="lc-editor-overlay__value">
            {isImporting ? "Importing..." : "Browser only"}
          </span>
        </span>
        <input
          accept=".svg,image/svg+xml"
          className="lc-parameter-field__number"
          disabled={isImporting}
          type="file"
          onChange={async (event) => {
            const [file] = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";

            if (!file) {
              return;
            }

            setImportError(null);
            setIsImporting(true);
            try {
              const nextState = await importSvgOutlineFile(file);
              updateProgramState(() => nextState);
            } catch (error) {
              setImportError(error instanceof Error ? error.message : "Failed to import SVG.");
            } finally {
              setIsImporting(false);
            }
          }}
        />
      </label>

      <div className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">
          Source
          <span className="lc-editor-overlay__value">
            {programState.sourceName || "None"}
          </span>
        </span>
      </div>

      <div className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">
          Imported paths
          <span className="lc-editor-overlay__value">
            {programState.paths.length} paths / {countSvgOutlinePoints(programState)} points
          </span>
        </span>
      </div>

      {importError ? (
        <p
          style={{
            color: "var(--studio-danger, #b91c1c)",
            fontSize: 13,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {importError}
        </p>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          className="studio-button studio-button--compact"
          type="button"
          onClick={() => {
            setImportError(null);
            updateProgramState(() => defaultSvgConcentricOutlineProgramState());
          }}
        >
          Restore default
        </button>

        <button
          className="studio-button studio-button--compact"
          type="button"
          onClick={() => {
            setImportError(null);
            updateProgramState(() => ({
              sourceName: "",
              paths: [],
            }));
          }}
        >
          Clear
        </button>
      </div>
    </ProgramEditorPanel>
  );
}
