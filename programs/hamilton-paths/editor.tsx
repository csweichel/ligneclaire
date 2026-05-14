import { ProgramEditorCanvas, ProgramEditorPanel } from "@ligneclaire/ui";
import { contentBounds, type ProgramEditorProps } from "@ligneclaire/sdk";
import { useEffectEvent, useMemo, useRef, useState, type ChangeEvent, type JSX } from "react";
import { parseHamiltonGuideCsv } from "./csv";
import {
  buildHamiltonEditableNodes,
  clearHamiltonGuidePoints,
  clearHamiltonNodeOffset,
  clearHamiltonNodeOffsets,
  importHamiltonGuidePoints,
  moveHamiltonNode,
  resolveHamiltonGuideNodeOffsets,
  setHamiltonGuideMode,
  selectHamiltonNode,
  type HamiltonPathsProgramState,
  type HamiltonPathsSchema,
} from "./index";

type Props = ProgramEditorProps<HamiltonPathsSchema, HamiltonPathsProgramState>;

function markerRadius(nodeCount: number): number {
  if (nodeCount > 2400) {
    return 2.4;
  }
  if (nodeCount > 1200) {
    return 2.9;
  }
  if (nodeCount > 500) {
    return 3.4;
  }

  return 4.2;
}

export default function HamiltonPathsEditor({
  canvas,
  params,
  preview,
  programState,
  updateProgramState,
}: Props): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const nodes = useMemo(
    () => buildHamiltonEditableNodes(params, programState),
    [params, programState]
  );
  const selectedNode =
    nodes.find((node) => node.id === programState.selectedNodeId) ?? null;
  const movedCount = nodes.filter((node) => node.moved).length;
  const guidedCount = useMemo(
    () =>
      programState.guideMode === "csv"
        ? Object.keys(resolveHamiltonGuideNodeOffsets(params, programState.csvGuidePoints)).length
        : 0,
    [params, programState.csvGuidePoints, programState.guideMode]
  );
  const baseRadius = markerRadius(nodes.length);
  const bounds = contentBounds(canvas);

  const moveNode = useEffectEvent((nodeId: string, clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const rect = root.getBoundingClientRect();
    const next = preview.screenToCanvas({
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return;
    }

    updateProgramState((current) => moveHamiltonNode(current, nodeId, node.base, next));
  });

  const updateSelectedCoordinate = (axis: "x" | "y", value: number) => {
    if (!selectedNode || Number.isNaN(value) || !Number.isFinite(value)) {
      return;
    }

    updateProgramState((current) =>
      moveHamiltonNode(current, selectedNode.id, selectedNode.base, {
        ...selectedNode.position,
        [axis]: value,
      })
    );
  };

  async function handleCsvChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    setCsvLoading(true);
    setCsvError(null);

    try {
      const guidePoints = parseHamiltonGuideCsv(await file.text());
      updateProgramState((current) =>
        importHamiltonGuidePoints(current, params, guidePoints, file.name)
      );
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : "Failed to import the CSV guide points.");
    } finally {
      setCsvLoading(false);
    }
  }

  return (
    <>
      <ProgramEditorPanel>
        <div className="lc-editor-overlay__header">
          <p className="lc-editor-overlay__eyebrow">Program Editor</p>
          <h3 className="lc-editor-overlay__title">Node Overrides</h3>
        </div>

        <p className="lc-editor-overlay__copy">
          Click any lattice node to select it, then drag it on the sheet or enter exact X/Y
          coordinates. Clearing a node removes its local override and returns it to the active
          lattice or CSV-guided position.
        </p>

        <label className="lc-editor-overlay__field">
          <span className="lc-editor-overlay__label">Guide Mode</span>
          <select
            className="studio-input studio-input--compact"
            value={programState.guideMode}
            onChange={(event) => {
              setCsvError(null);
              updateProgramState((current) =>
                setHamiltonGuideMode(
                  current,
                  event.currentTarget.value === "csv" ? "csv" : "manual"
                )
              );
            }}
          >
            <option value="manual">Manual</option>
            <option value="csv">CSV Guides</option>
          </select>
        </label>

        <label className="lc-editor-overlay__field">
          <span className="lc-editor-overlay__label">CSV Guide Points</span>

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
              disabled={csvLoading}
              onClick={() => {
                csvInputRef.current?.click();
              }}
            >
              {csvLoading
                ? "Loading..."
                : programState.csvGuidePoints.length > 0
                  ? "Replace CSV"
                  : "Load CSV"}
            </button>

            {programState.csvGuidePoints.length > 0 ? (
              <button
                className="studio-button studio-button--compact"
                type="button"
                disabled={csvLoading}
                onClick={() => {
                  setCsvError(null);
                  updateProgramState((current) =>
                    clearHamiltonGuidePoints(current, params)
                  );
                }}
              >
                Clear CSV
              </button>
            ) : null}

            <input
              ref={csvInputRef}
              accept=".csv,text/csv"
              style={{ display: "none" }}
              type="file"
              onChange={(event) => {
                void handleCsvChange(event);
              }}
            />
          </div>

          <span className="lc-editor-overlay__value" style={{ display: "block", marginTop: 8 }}>
            {programState.csvGuidePoints.length > 0
              ? `${programState.csvGuideSourceName || "guide.csv"} · ${programState.csvGuidePoints.length} points loaded${programState.guideMode === "csv" ? ` · ${guidedCount} nodes assigned` : ""}`
              : "CSV format: x,y in millimeters. Header rows with x/y are supported."}
          </span>
          {csvError ? (
            <span
              style={{
                display: "block",
                marginTop: 6,
                color: "var(--studio-red)",
                fontSize: "0.82rem",
                lineHeight: 1.45,
              }}
            >
              {csvError}
            </span>
          ) : null}
        </label>

        <div className="lc-editor-overlay__field">
          <span className="lc-editor-overlay__label">
            Nodes
            <span className="lc-editor-overlay__value">
              {nodes.length} total · {movedCount} adjusted
            </span>
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            className="studio-button studio-button--compact"
            disabled={!selectedNode}
            type="button"
            onClick={() => {
              if (!selectedNode) {
                return;
              }

              updateProgramState((current) =>
                clearHamiltonNodeOffset(current, selectedNode.id)
              );
            }}
          >
            Reset Selected
          </button>

          <button
            className="studio-button studio-button--compact"
            disabled={Object.keys(programState.nodeOffsets).length === 0}
            type="button"
            onClick={() => {
              updateProgramState((current) => clearHamiltonNodeOffsets(current));
            }}
          >
            Reset Overrides
          </button>
        </div>

        {selectedNode ? (
          <>
            <div className="lc-editor-overlay__field">
              <span className="lc-editor-overlay__label">
                Selected
                <span className="lc-editor-overlay__value">
                  Row {selectedNode.row + 1}, Col {selectedNode.col + 1}
                </span>
              </span>
            </div>

            <label className="lc-editor-overlay__field">
              <span className="lc-editor-overlay__label">
                X
                <span className="lc-editor-overlay__value">
                  {selectedNode.position.x.toFixed(2)} mm
                </span>
              </span>
              <input
                className="lc-parameter-field__number"
                max={bounds.maxX}
                min={bounds.minX}
                step={0.1}
                type="number"
                value={selectedNode.position.x}
                onChange={(event) => {
                  updateSelectedCoordinate("x", Number(event.currentTarget.value));
                }}
              />
            </label>

            <label className="lc-editor-overlay__field">
              <span className="lc-editor-overlay__label">
                Y
                <span className="lc-editor-overlay__value">
                  {selectedNode.position.y.toFixed(2)} mm
                </span>
              </span>
              <input
                className="lc-parameter-field__number"
                max={bounds.maxY}
                min={bounds.minY}
                step={0.1}
                type="number"
                value={selectedNode.position.y}
                onChange={(event) => {
                  updateSelectedCoordinate("y", Number(event.currentTarget.value));
                }}
              />
            </label>
          </>
        ) : (
          <p className="lc-editor-overlay__copy">
            Select a node on the preview to edit its exact location.
          </p>
        )}
      </ProgramEditorPanel>

      <ProgramEditorCanvas ref={rootRef}>
        <svg
          aria-label="Hamilton node editor"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          {programState.guideMode === "csv"
            ? programState.csvGuidePoints.map((point, index) => {
                const screenPoint = preview.canvasToScreen(point);
                return (
                  <g key={`guide-${index}`} opacity={0.9}>
                    <circle
                      cx={screenPoint.x}
                      cy={screenPoint.y}
                      fill="rgba(16, 185, 129, 0.12)"
                      r={baseRadius + 4}
                      stroke="rgba(5, 150, 105, 0.48)"
                      strokeWidth={1.2}
                    />
                    <line
                      x1={screenPoint.x - (baseRadius + 5)}
                      x2={screenPoint.x + (baseRadius + 5)}
                      y1={screenPoint.y}
                      y2={screenPoint.y}
                      stroke="rgba(5, 150, 105, 0.68)"
                      strokeWidth={1.2}
                    />
                    <line
                      x1={screenPoint.x}
                      x2={screenPoint.x}
                      y1={screenPoint.y - (baseRadius + 5)}
                      y2={screenPoint.y + (baseRadius + 5)}
                      stroke="rgba(5, 150, 105, 0.68)"
                      strokeWidth={1.2}
                    />
                  </g>
                );
              })
            : null}

          {nodes.map((node) => {
            const base = preview.canvasToScreen(node.base);
            const position = preview.canvasToScreen(node.position);
            const selected = node.id === selectedNode?.id;
            const moved = node.moved;
            const radius = selected ? baseRadius + 2.6 : moved ? baseRadius + 1 : baseRadius;

            return (
              <g
                key={node.id}
                style={{
                  pointerEvents: "auto",
                  cursor: draggingNodeId === node.id ? "grabbing" : "grab",
                }}
              >
                {moved ? (
                  <line
                    x1={base.x}
                    x2={position.x}
                    y1={base.y}
                    y2={position.y}
                    stroke="rgba(91, 108, 255, 0.42)"
                    strokeDasharray="4 4"
                    strokeWidth={1.4}
                  />
                ) : null}

                {moved ? (
                  <circle
                    cx={base.x}
                    cy={base.y}
                    fill="rgba(255, 255, 255, 0.92)"
                    r={Math.max(1.5, baseRadius - 1.2)}
                    stroke="rgba(31, 41, 55, 0.18)"
                    strokeWidth={1}
                  />
                ) : null}

                {selected ? (
                  <circle
                    cx={position.x}
                    cy={position.y}
                    fill="rgba(91, 108, 255, 0.14)"
                    r={radius + 4}
                  />
                ) : null}

                <circle
                  cx={position.x}
                  cy={position.y}
                  fill={
                    selected
                      ? "rgba(91, 108, 255, 1)"
                      : moved
                        ? "#f59e0b"
                        : "rgba(31, 41, 55, 0.78)"
                  }
                  r={radius}
                  stroke="rgba(255, 255, 255, 0.96)"
                  strokeWidth={selected ? 2 : 1.2}
                  onPointerDown={(event) => {
                    setDraggingNodeId(node.id);
                    updateProgramState((current) => selectHamiltonNode(current, node.id));
                    event.currentTarget.setPointerCapture(event.pointerId);
                    moveNode(node.id, event.clientX, event.clientY);
                  }}
                  onPointerMove={(event) => {
                    if (draggingNodeId !== node.id) {
                      return;
                    }

                    moveNode(node.id, event.clientX, event.clientY);
                  }}
                  onPointerUp={() => {
                    setDraggingNodeId(null);
                  }}
                  onLostPointerCapture={() => {
                    setDraggingNodeId(null);
                  }}
                />
              </g>
            );
          })}
        </svg>
      </ProgramEditorCanvas>
    </>
  );
}
