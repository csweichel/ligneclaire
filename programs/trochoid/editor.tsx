import { clamp, contentBounds } from "@ligneclaire/sdk";
import type { ProgramEditorProps } from "@ligneclaire/sdk";
import { useEffectEvent, useRef, useState, type JSX } from "react";
import { canvas, type TrochoidProgramState, type TrochoidSchema } from "./index";

type Props = ProgramEditorProps<TrochoidSchema, TrochoidProgramState>;

export default function TrochoidEditor({
  params,
  preview,
  programState,
  updateProgramState,
}: Props): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const bounds = contentBounds(canvas);

  const moveCenter = useEffectEvent((clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const rect = root.getBoundingClientRect();
    const next = preview.screenToCanvas({
      x: clientX - rect.left,
      y: clientY - rect.top,
    });

    updateProgramState((current) => ({
      ...current,
      center: {
        x: clamp(next.x, bounds.minX, bounds.maxX),
        y: clamp(next.y, bounds.minY, bounds.maxY),
      },
    }));
  });

  const screenPoint = preview.canvasToScreen(programState.center);

  return (
    <div ref={rootRef} className="lc-editor-root">
      <section className="lc-editor-overlay">
        <div className="lc-editor-overlay__header">
          <p className="lc-editor-overlay__eyebrow">Program Editor</p>
          <h3 className="lc-editor-overlay__title">Figure placement</h3>
        </div>

        <p className="lc-editor-overlay__copy">
          Drag the center handle to place the {params.useEpitrochoid ? "epitrochoid" : "hypotrochoid"} on
          the page. Radius still respects the remaining safe area around that point.
        </p>

        <div className="lc-editor-overlay__field">
          <span className="lc-editor-overlay__label">
            Center
            <span className="lc-editor-overlay__value">
              {programState.center.x.toFixed(1)} mm, {programState.center.y.toFixed(1)} mm
            </span>
          </span>
        </div>

        <button
          className="studio-button studio-button--compact"
          type="button"
          onClick={() => {
            updateProgramState(() => ({
              center: {
                x: canvas.widthMm * 0.5,
                y: canvas.heightMm * 0.5,
              },
            }));
          }}
        >
          Recenter figure
        </button>
      </section>

      <button
        aria-label="Drag trochoid center"
        className="lc-editor-handle"
        style={{
          left: `${screenPoint.x}px`,
          top: `${screenPoint.y}px`,
          cursor: dragging ? "grabbing" : "grab",
        }}
        type="button"
        onLostPointerCapture={() => {
          setDragging(false);
        }}
        onPointerDown={(event) => {
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          moveCenter(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!dragging) {
            return;
          }

          moveCenter(event.clientX, event.clientY);
        }}
        onPointerUp={() => {
          setDragging(false);
        }}
      />
    </div>
  );
}
