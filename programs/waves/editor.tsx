import { ProgramEditorCanvas, ProgramEditorPanel } from "@ligneclaire/ui";
import { clamp, contentBounds } from "@ligneclaire/sdk";
import type { ProgramEditorProps } from "@ligneclaire/sdk";
import { useEffectEvent, useRef, useState, type JSX } from "react";
import type { WavesProgramState, WavesSchema } from "./index";

type Props = ProgramEditorProps<WavesSchema, WavesProgramState>;

export default function WavesEditor({
  programState,
  preview,
  updateProgramState,
}: Props): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const bounds = contentBounds({
    widthMm: 420,
    heightMm: 297,
    marginMm: 10,
  });

  const moveFocus = useEffectEvent((clientX: number, clientY: number) => {
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
      focus: {
        x: clamp(next.x, bounds.minX, bounds.maxX),
        y: clamp(next.y, bounds.minY, bounds.maxY),
      },
    }));
  });

  const screenPoint = preview.canvasToScreen(programState.focus);

  return (
    <>
      <ProgramEditorPanel>
        <div className="lc-editor-overlay__header">
          <p className="lc-editor-overlay__eyebrow">Program Editor</p>
          <h3 className="lc-editor-overlay__title">Focus field</h3>
        </div>

        <p className="lc-editor-overlay__copy">
          Drag the ink target on the paper to reposition the wave focus. Falloff controls how
          widely that focal point influences neighboring bands.
        </p>

        <label className="lc-editor-overlay__field">
          <span className="lc-editor-overlay__label">
            Falloff
            <span className="lc-editor-overlay__value">{programState.falloff.toFixed(2)}</span>
          </span>
          <input
            className="lc-editor-overlay__range"
            max={0.9}
            min={0.15}
            step={0.01}
            type="range"
            value={programState.falloff}
            onChange={(event) => {
              const nextValue = Number(event.currentTarget.value);
              updateProgramState((current) => ({
                ...current,
                falloff: clamp(nextValue, 0.15, 0.9),
              }));
            }}
          />
        </label>

        <button
          className="studio-button studio-button--compact"
          type="button"
          onClick={() => {
            updateProgramState((current) => ({
              ...current,
              focus: {
                x: 210,
                y: 148.5,
              },
            }));
          }}
        >
          Recenter focus
        </button>
      </ProgramEditorPanel>

      <ProgramEditorCanvas ref={rootRef}>
        <button
          aria-label="Drag wave focus"
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
            moveFocus(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (!dragging) {
              return;
            }

            moveFocus(event.clientX, event.clientY);
          }}
          onPointerUp={() => {
            setDragging(false);
          }}
        />
      </ProgramEditorCanvas>
    </>
  );
}
