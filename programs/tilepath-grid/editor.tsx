import type { ProgramEditorProps } from "@ligneclaire/sdk";
import { ProgramEditorCanvas, ProgramEditorPanel } from "@ligneclaire/ui";
import { useMemo, useState, type CSSProperties, type JSX } from "react";
import {
  applyToolToState,
  buildTilepathLayout,
  cellId,
  findTileTool,
  tileTools,
  toolForKindRotation,
  toolForOverride,
  type TilepathGridProgramState,
  type TilepathGridSchema,
} from "./index";

type Props = ProgramEditorProps<TilepathGridSchema, TilepathGridProgramState>;

function cellStyle(locked: boolean, width: number): CSSProperties {
  return {
    position: "absolute",
    display: "grid",
    placeItems: "center",
    borderRadius: 6,
    border: locked ? "1px solid rgba(15, 23, 42, 0.7)" : "1px dashed rgba(15, 23, 42, 0.28)",
    background: locked ? "rgba(241, 245, 249, 0.88)" : "rgba(248, 250, 252, 0.32)",
    color: locked ? "#0f172a" : "rgba(15, 23, 42, 0.68)",
    fontSize: `${Math.max(9, Math.min(12, width * 0.18))}px`,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    zIndex: 1,
    pointerEvents: "auto",
  };
}

function toolButtonStyle(active: boolean): CSSProperties | undefined {
  return active
    ? {
        background: "#0f172a",
        color: "#f8fafc",
        borderColor: "#0f172a",
      }
    : undefined;
}

export default function TilepathGridEditor({
  params,
  programState,
  preview,
  updateProgramState,
}: Props): JSX.Element {
  const [selectedToolId, setSelectedToolId] = useState("line-h");
  const layout = useMemo(
    () => buildTilepathLayout(params, programState),
    [params, programState]
  );

  return (
    <>
      <ProgramEditorPanel>
        <div className="lc-editor-overlay__header">
          <p className="lc-editor-overlay__eyebrow">Program Editor</p>
          <h3 className="lc-editor-overlay__title">Tile overrides</h3>
        </div>

        <p className="lc-editor-overlay__copy">
          Pick a tile, then click cells on the sheet to lock solver output. Use `Unset` to return a
          cell to automatic routing.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          {tileTools.map((tool) => (
            <button
              key={tool.id}
              className="studio-button studio-button--compact"
              style={toolButtonStyle(selectedToolId === tool.id)}
              type="button"
              onClick={() => {
                setSelectedToolId(tool.id);
              }}
            >
              {tool.short}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginTop: 12,
          }}
        >
          <span
            style={{
              color: "rgba(15, 23, 42, 0.68)",
              fontSize: 12,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {findTileTool(selectedToolId)?.label ?? "Tool"}
          </span>

          <button
            className="studio-button studio-button--compact"
            type="button"
            onClick={() => {
              updateProgramState(() => ({
                cells: {},
              }));
            }}
          >
            Clear all
          </button>
        </div>
      </ProgramEditorPanel>

      <ProgramEditorCanvas>
        {Array.from({ length: layout.rows }, (_, row) =>
          Array.from({ length: layout.cols }, (_, col) => {
            const id = cellId(row, col);
            const override = programState.cells[id];
            const index = row * layout.cols + col;
            const resolvedTool = toolForKindRotation(
              layout.grid.tiles[index]!,
              layout.result.rotations[index] ?? 0
            );
            const displayTool = toolForOverride(override) ?? resolvedTool;
            const origin = {
              x: layout.result.origin.x + col * layout.result.cellSize,
              y: layout.result.origin.y + (layout.rows - 1 - row) * layout.result.cellSize,
            };
            const topLeft = preview.canvasToScreen({
              x: origin.x,
              y: origin.y + layout.result.cellSize,
            });
            const bottomRight = preview.canvasToScreen({
              x: origin.x + layout.result.cellSize,
              y: origin.y,
            });
            const width = Math.max(8, bottomRight.x - topLeft.x - 4);
            const height = Math.max(8, bottomRight.y - topLeft.y - 4);

            return (
              <button
                key={id}
                aria-label={`Tile ${row + 1}, ${col + 1}`}
                type="button"
                style={{
                  ...cellStyle(Boolean(override), width),
                  left: topLeft.x + 2,
                  top: topLeft.y + 2,
                  width,
                  height,
                }}
                onClick={() => {
                  updateProgramState((current) => applyToolToState(current, id, selectedToolId));
                }}
              >
                {displayTool.short}
              </button>
            );
          })
        )}
      </ProgramEditorCanvas>
    </>
  );
}
