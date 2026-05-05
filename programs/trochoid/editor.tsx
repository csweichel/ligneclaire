import type { CSSProperties, JSX } from "react";
import { ProgramEditorCanvas, ProgramEditorPanel } from "@ligneclaire/ui";
import type { ProgramEditorProps } from "@ligneclaire/sdk";
import { clamp } from "@ligneclaire/sdk";
import { useEffectEvent, useRef, useState } from "react";
import {
  MAX_TROCHOID_FIGURES,
  addTrochoidFigure,
  moveTrochoidFigure,
  patchTrochoidFigureConfig,
  removeTrochoidFigure,
  selectTrochoidFigure,
  type TrochoidFigure,
  type TrochoidFigureConfig,
  type TrochoidProgramState,
  type TrochoidSchema,
} from "./index";

type Props = ProgramEditorProps<TrochoidSchema, TrochoidProgramState>;

type NumericFieldProps = Readonly<{
  label: string;
  max: number;
  min: number;
  step: number;
  unit?: string;
  value: number;
  onChange: (value: number) => void;
}>;

type ToggleFieldProps = Readonly<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}>;

function figureButtonStyle(selected: boolean): CSSProperties | undefined {
  return selected
    ? {
        background: "#0f172a",
        borderColor: "#0f172a",
        color: "#f8fafc",
      }
    : undefined;
}

function handleStyle(selected: boolean): CSSProperties {
  return {
    position: "absolute",
    display: "grid",
    placeItems: "center",
    width: selected ? 30 : 24,
    height: selected ? 30 : 24,
    border: selected ? "2px solid #0f172a" : "1px solid rgba(15, 23, 42, 0.42)",
    borderRadius: 999,
    background: selected ? "#f8fafc" : "rgba(255, 250, 244, 0.95)",
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    transform: "translate(-50%, -50%)",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.16)",
    pointerEvents: "auto",
  };
}

function labelForFigure(figures: readonly TrochoidFigure[], figureId: string): string {
  const index = figures.findIndex((figure) => figure.id === figureId);
  return `Figure ${index + 1}`;
}

function ToggleField({ label, checked, onChange }: ToggleFieldProps): JSX.Element {
  return (
    <label
      className="lc-editor-overlay__field"
      style={{
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
      }}
    >
      <span className="lc-editor-overlay__label">{label}</span>
      <input
        checked={checked}
        className="lc-parameter-toggle__checkbox"
        type="checkbox"
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
    </label>
  );
}

function NumericField({
  label,
  max,
  min,
  step,
  unit,
  value,
  onChange,
}: NumericFieldProps): JSX.Element {
  return (
    <label className="lc-editor-overlay__field">
      <span className="lc-editor-overlay__label">
        {label}
        <span className="lc-editor-overlay__value">
          {value.toFixed(step >= 1 ? 0 : 2)}
          {unit ? ` ${unit}` : ""}
        </span>
      </span>

      <div
        className="lc-parameter-field__controls"
        style={{
          gridTemplateColumns: "minmax(0, 1fr) 88px",
        }}
      >
        <input
          className="lc-editor-overlay__range"
          max={max}
          min={min}
          step={step}
          type="range"
          value={value}
          onChange={(event) => {
            onChange(clamp(Number(event.currentTarget.value), min, max));
          }}
        />
        <input
          className="lc-parameter-field__number"
          max={max}
          min={min}
          step={step}
          type="number"
          value={value}
          onChange={(event) => {
            const nextValue = Number(event.currentTarget.value);
            if (Number.isNaN(nextValue)) {
              return;
            }

            onChange(clamp(nextValue, min, max));
          }}
        />
      </div>
    </label>
  );
}

export default function TrochoidEditor({
  preview,
  programState,
  updateProgramState,
}: Props): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [draggingFigureId, setDraggingFigureId] = useState<string | null>(null);
  const selectedFigure = programState.figures.find(
    (figure) => figure.id === programState.selectedFigureId
  ) ?? programState.figures[0];

  const moveFigure = useEffectEvent((figureId: string, clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const rect = root.getBoundingClientRect();
    const next = preview.screenToCanvas({
      x: clientX - rect.left,
      y: clientY - rect.top,
    });

    updateProgramState((current) => moveTrochoidFigure(current, figureId, next));
  });

  const updateSelectedFigureConfig = <Key extends keyof TrochoidFigureConfig>(
    key: Key,
    value: TrochoidFigureConfig[Key]
  ) => {
    if (!selectedFigure) {
      return;
    }

    updateProgramState((current) =>
      patchTrochoidFigureConfig(current, selectedFigure.id, {
        [key]: value,
      })
    );
  };

  const selectedRollingMax = selectedFigure
    ? selectedFigure.config.useEpitrochoid
      ? 72
      : Math.max(3, Math.min(72, selectedFigure.config.fixedRadius - 1))
    : 72;

  return (
    <>
      <ProgramEditorPanel>
        <div className="lc-editor-overlay__header">
          <p className="lc-editor-overlay__eyebrow">Program Editor</p>
          <h3 className="lc-editor-overlay__title">Trochoid Figures</h3>
        </div>

        <p className="lc-editor-overlay__copy">
          Each figure keeps its own geometry. Select one figure to edit its type, radii, offset,
          size, rotation, and sampling, then drag its numbered handle on the sheet.
        </p>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <button
            className="studio-button studio-button--compact"
            disabled={programState.figures.length >= MAX_TROCHOID_FIGURES}
            type="button"
            onClick={() => {
              updateProgramState((current) => addTrochoidFigure(current));
            }}
          >
            Add Figure
          </button>

          <button
            className="studio-button studio-button--compact"
            disabled={!selectedFigure}
            type="button"
            onClick={() => {
              if (!selectedFigure) {
                return;
              }

              updateProgramState((current) =>
                removeTrochoidFigure(current, selectedFigure.id)
              );
            }}
          >
            Remove Selected
          </button>
        </div>

        <div className="lc-editor-overlay__field">
          <span className="lc-editor-overlay__label">
            Figures
            <span className="lc-editor-overlay__value">
              {programState.figures.length}/{MAX_TROCHOID_FIGURES}
            </span>
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gap: 8,
          }}
        >
          {programState.figures.map((figure) => {
            const selected = figure.id === selectedFigure?.id;

            return (
              <button
                key={figure.id}
                className="studio-button studio-button--compact"
                style={{
                  justifyContent: "space-between",
                  textAlign: "left",
                  ...figureButtonStyle(selected),
                }}
                type="button"
                onClick={() => {
                  updateProgramState((current) =>
                    selectTrochoidFigure(current, figure.id)
                  );
                }}
              >
                <span>{labelForFigure(programState.figures, figure.id)}</span>
                <span>
                  {figure.config.useEpitrochoid ? "Epi" : "Hypo"} · {figure.center.x.toFixed(0)}/
                  {figure.center.y.toFixed(0)}
                </span>
              </button>
            );
          })}
        </div>

        {selectedFigure ? (
          <>
            <div className="lc-editor-overlay__field">
              <span className="lc-editor-overlay__label">
                Selected
                <span className="lc-editor-overlay__value">
                  {labelForFigure(programState.figures, selectedFigure.id)}
                </span>
              </span>
            </div>

            <ToggleField
              checked={selectedFigure.config.useEpitrochoid}
              label="Use Epitrochoid"
              onChange={(checked) => {
                updateSelectedFigureConfig("useEpitrochoid", checked);
              }}
            />

            <NumericField
              label="Fixed Radius"
              max={144}
              min={16}
              step={1}
              value={selectedFigure.config.fixedRadius}
              onChange={(value) => {
                updateSelectedFigureConfig("fixedRadius", Math.round(value));
              }}
            />

            <NumericField
              label="Rolling Radius"
              max={selectedRollingMax}
              min={3}
              step={1}
              value={selectedFigure.config.rollingRadius}
              onChange={(value) => {
                updateSelectedFigureConfig("rollingRadius", Math.round(value));
              }}
            />

            <NumericField
              label="Pen Offset"
              max={2}
              min={0}
              step={0.01}
              value={selectedFigure.config.pointOffsetRatio}
              onChange={(value) => {
                updateSelectedFigureConfig("pointOffsetRatio", value);
              }}
            />

            <NumericField
              label="Figure Radius"
              max={95}
              min={12}
              step={0.5}
              unit="mm"
              value={selectedFigure.config.figureRadius}
              onChange={(value) => {
                updateSelectedFigureConfig("figureRadius", value);
              }}
            />

            <NumericField
              label="Rotation"
              max={360}
              min={0}
              step={1}
              unit="deg"
              value={selectedFigure.config.rotationDeg}
              onChange={(value) => {
                updateSelectedFigureConfig("rotationDeg", value);
              }}
            />

            <NumericField
              label="Samples Per Turn"
              max={720}
              min={64}
              step={1}
              value={selectedFigure.config.samplesPerTurn}
              onChange={(value) => {
                updateSelectedFigureConfig("samplesPerTurn", Math.round(value));
              }}
            />
          </>
        ) : null}
      </ProgramEditorPanel>

      <ProgramEditorCanvas ref={rootRef}>
        {programState.figures.map((figure) => {
          const selected = figure.id === selectedFigure?.id;
          const screenPoint = preview.canvasToScreen(figure.center);

          return (
            <button
              key={figure.id}
              aria-label={`Drag ${labelForFigure(programState.figures, figure.id)}`}
              style={{
                ...handleStyle(selected),
                left: `${screenPoint.x}px`,
                top: `${screenPoint.y}px`,
                cursor: draggingFigureId === figure.id ? "grabbing" : "grab",
              }}
              type="button"
              onLostPointerCapture={() => {
                setDraggingFigureId((current) =>
                  current === figure.id ? null : current
                );
              }}
              onPointerDown={(event) => {
                setDraggingFigureId(figure.id);
                updateProgramState((current) => selectTrochoidFigure(current, figure.id));
                event.currentTarget.setPointerCapture(event.pointerId);
                moveFigure(figure.id, event.clientX, event.clientY);
              }}
              onPointerMove={(event) => {
                if (draggingFigureId !== figure.id) {
                  return;
                }

                moveFigure(figure.id, event.clientX, event.clientY);
              }}
              onPointerUp={() => {
                setDraggingFigureId((current) =>
                  current === figure.id ? null : current
                );
              }}
            >
              {programState.figures.findIndex((candidate) => candidate.id === figure.id) + 1}
            </button>
          );
        })}
      </ProgramEditorCanvas>
    </>
  );
}
