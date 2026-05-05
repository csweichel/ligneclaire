import { clamp, contentBounds } from "@ligneclaire/sdk";
import type { ProgramEditorProps } from "@ligneclaire/sdk";
import { useEffectEvent, useRef, useState, type JSX } from "react";
import type { ProgramSchema, ProgramState } from "./index";

type Props = ProgramEditorProps<ProgramSchema, ProgramState>;

export default function ProgramEditor({
  programState,
  preview,
  updateProgramState,
}: Props): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const bounds = contentBounds({
    widthMm: 297,
    heightMm: 210,
    marginMm: 12,
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
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
      <div className="pointer-events-auto absolute bottom-4 left-4 rounded-2xl border border-slate-900/10 bg-white/90 px-4 py-3 shadow-lg shadow-slate-900/10 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Editor</p>
        <p className="mt-2 max-w-xs text-sm text-slate-700">
          Replace this helper text with guidance for the specific interactions your program supports.
        </p>
      </div>
      <button
        aria-label="Drag focus point"
        className="pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600 shadow-lg shadow-red-800/20"
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
    </div>
  );
}

