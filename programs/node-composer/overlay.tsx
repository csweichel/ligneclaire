import { ProgramEditorCanvas } from "@ligneclaire/ui";
import type { PreviewBridge } from "@ligneclaire/sdk";
import { useEffectEvent, useRef, useState, type JSX } from "react";
import {
  guidePathsForNode,
  nodeAnchorPoint,
  type ComposerNode,
} from "./model";

type NodeComposerOverlayProps = Readonly<{
  preview: PreviewBridge;
  selectedNode: ComposerNode | null;
  onMoveAnchor: (point: { x: number; y: number }) => void;
}>;

function toSvgPath(preview: PreviewBridge, points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) {
    return "";
  }

  const [first, ...rest] = points.map((point) => preview.canvasToScreen(point));
  return [
    `M ${first!.x} ${first!.y}`,
    ...rest.map((point) => `L ${point.x} ${point.y}`),
  ].join(" ");
}

export function NodeComposerOverlay({
  preview,
  selectedNode,
  onMoveAnchor,
}: NodeComposerOverlayProps): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const anchor = selectedNode ? nodeAnchorPoint(selectedNode) : null;
  const guidePaths = selectedNode ? guidePathsForNode(selectedNode) : [];

  const moveAnchor = useEffectEvent((clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const rect = root.getBoundingClientRect();
    onMoveAnchor(
      preview.screenToCanvas({
        x: clientX - rect.left,
        y: clientY - rect.top,
      })
    );
  });

  if (!selectedNode) {
    return null;
  }

  const handlePosition = anchor ? preview.canvasToScreen(anchor) : null;

  return (
    <ProgramEditorCanvas ref={rootRef}>
      <svg className="lc-node-composer__overlay-svg" aria-hidden="true">
        {guidePaths.map((path, index) => (
          <path
            key={`${selectedNode.id}:guide:${index}`}
            className="lc-node-composer__overlay-guide"
            d={toSvgPath(preview, path.points)}
          />
        ))}
      </svg>

      {handlePosition ? (
        <button
          className="lc-editor-handle lc-node-composer__overlay-handle"
          style={{
            left: handlePosition.x,
            top: handlePosition.y,
          }}
          title="Drag to move the selected node on the sheet."
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!dragging) {
              return;
            }

            moveAnchor(event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            if (dragging) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            setDragging(false);
          }}
          onPointerCancel={() => {
            setDragging(false);
          }}
        />
      ) : null}
    </ProgramEditorCanvas>
  );
}
