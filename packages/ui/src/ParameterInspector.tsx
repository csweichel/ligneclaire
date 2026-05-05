import { clamp, type ParameterSchema } from "@ligneclaire/engine";
import type { JSX } from "react";

type ParameterValues = Readonly<Record<string, number | boolean>>;

export type ParameterInspectorProps = Readonly<{
  schema: ParameterSchema;
  values: ParameterValues;
  onChange: (key: string, value: number | boolean) => void;
}>;

export function ParameterInspector({
  schema,
  values,
  onChange,
}: ParameterInspectorProps): JSX.Element {
  const groups = new Map<string, Array<readonly [string, ParameterSchema[string]]>>();

  for (const entry of Object.entries(schema)) {
    const group = entry[1].group ?? "General";
    const bucket = groups.get(group) ?? [];
    bucket.push(entry);
    groups.set(group, bucket);
  }

  return (
    <div className="lc-parameter-inspector">
      {[...groups.entries()].map(([groupName, entries]) => (
        <section key={groupName} className="lc-parameter-group">
          <div className="lc-parameter-group__header">
            <h3 className="lc-parameter-group__title">{groupName}</h3>
            <span className="lc-parameter-group__meta">
              {entries.length} control{entries.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="lc-parameter-group__body">
            {entries.map(([key, spec]) => {
              const value = values[key];

              if (spec.kind === "bool") {
                return (
                  <label key={key} className="lc-parameter-toggle">
                    <div className="lc-parameter-toggle__copy">
                      <p className="lc-parameter-field__label">{spec.label ?? key}</p>
                      {spec.description ? (
                        <p className="lc-parameter-field__description">{spec.description}</p>
                      ) : null}
                    </div>
                    <input
                      checked={Boolean(value)}
                      className="lc-parameter-toggle__checkbox"
                      type="checkbox"
                      onChange={(event) => {
                        onChange(key, event.currentTarget.checked);
                      }}
                    />
                  </label>
                );
              }

              const numericValue = typeof value === "number" ? value : spec.default;
              const step = spec.step ?? (spec.kind === "int" ? 1 : 0.01);

              return (
                <div key={key} className="lc-parameter-field">
                  <div className="lc-parameter-field__header">
                    <div>
                      <p className="lc-parameter-field__label">{spec.label ?? key}</p>
                      {spec.description ? (
                        <p className="lc-parameter-field__description">{spec.description}</p>
                      ) : null}
                    </div>
                    <span className="lc-parameter-field__value">
                      {numericValue.toFixed(spec.kind === "int" ? 0 : 2)}
                      {spec.unit ? ` ${spec.unit}` : ""}
                    </span>
                  </div>

                  <div className="lc-parameter-field__controls">
                    <input
                      className="lc-parameter-field__range"
                      max={spec.max}
                      min={spec.min}
                      step={step}
                      type="range"
                      value={numericValue}
                      onChange={(event) => {
                        const next = Number(event.currentTarget.value);
                        onChange(
                          key,
                          spec.kind === "int"
                            ? Math.round(clamp(next, spec.min, spec.max))
                            : clamp(next, spec.min, spec.max)
                        );
                      }}
                    />
                    <input
                      className="lc-parameter-field__number"
                      step={step}
                      type="number"
                      value={numericValue}
                      onChange={(event) => {
                        const next = Number(event.currentTarget.value);
                        if (Number.isNaN(next)) {
                          return;
                        }

                        onChange(
                          key,
                          spec.kind === "int"
                            ? Math.round(clamp(next, spec.min, spec.max))
                            : clamp(next, spec.min, spec.max)
                        );
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
