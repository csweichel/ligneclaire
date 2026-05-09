import { ProgramEditorCanvas, ProgramEditorPanel } from "@ligneclaire/ui";
import { contentBounds, type ProgramEditorProps } from "@ligneclaire/sdk";
import { useEffectEvent, useMemo, useRef, useState, type JSX } from "react";
import {
  buildHamiltonEditableNodes,
  clearHamiltonNodeOffset,
  clearHamiltonNodeOffsets,
  moveHamiltonNode,
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
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const nodes = useMemo(
    () => buildHamiltonEditableNodes(params, programState),
    [params, programState]
  );
  const selectedNode =
    nodes.find((node) => node.id === programState.selectedNodeId) ?? null;
  const movedCount = Object.keys(programState.nodeOffsets).length;
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

  return (
    <>
      <ProgramEditorPanel>
        <div className="lc-editor-overlay__header">
          <p className="lc-editor-overlay__eyebrow">Program Editor</p>
          <h3 className="lc-editor-overlay__title">Node Overrides</h3>
        </div>

        <p className="lc-editor-overlay__copy">
          Click any lattice node to select it, then drag it on the sheet or enter exact X/Y
          coordinates. Clearing a node removes its local offset and returns it to the generated
          lattice.
        </p>

        <div className="lc-editor-overlay__field">
          <span className="lc-editor-overlay__label">
            Nodes
            <span className="lc-editor-overlay__value">
              {nodes.length} total · {movedCount} moved
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
            disabled={movedCount === 0}
            type="button"
            onClick={() => {
              updateProgramState((current) => clearHamiltonNodeOffsets(current));
            }}
          >
            Reset All
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
