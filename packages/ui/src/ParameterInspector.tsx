import { clamp, type ParameterSchema } from "@ligneclaire/engine";
import type { JSX } from "react";
import { Badge } from "./components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./components/card";
import { Input } from "./components/input";
import { Switch } from "./components/switch";

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
    <div className="flex w-full flex-col gap-4">
      {[...groups.entries()].map(([groupName, entries]) => (
        <Card
          key={groupName}
          className="w-full rounded-lc-control border-lc-border bg-lc-panel shadow-none"
        >
          <CardHeader className="flex-row items-center justify-between gap-4 pb-3">
            <CardTitle className="text-base">{groupName}</CardTitle>
            <Badge variant="default">
              {entries.length} control{entries.length === 1 ? "" : "s"}
            </Badge>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 pt-0">
            {entries.map(([key, spec]) => {
              const value = values[key];

              if (spec.kind === "bool") {
                return (
                  <label
                    key={key}
                    className="flex items-start justify-between gap-4 rounded-lc-control border border-lc-border bg-lc-panel-subtle px-4 py-3"
                  >
                    <div className="grid gap-1">
                      <p className="text-sm font-semibold text-lc-text">{spec.label ?? key}</p>
                      {spec.description ? (
                        <p className="text-sm leading-6 text-lc-text-secondary">{spec.description}</p>
                      ) : null}
                    </div>
                    <Switch
                      checked={Boolean(value)}
                      onCheckedChange={(checked) => {
                        onChange(key, checked);
                      }}
                    />
                  </label>
                );
              }

              const numericValue = typeof value === "number" ? value : spec.default;
              const step = spec.step ?? (spec.kind === "int" ? 1 : 0.01);

              return (
                <div
                  key={key}
                  className="grid gap-3 rounded-lc-control border border-lc-border bg-lc-panel-subtle px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="grid gap-1">
                      <p className="text-sm font-semibold text-lc-text">{spec.label ?? key}</p>
                      {spec.description ? (
                        <p className="text-sm leading-6 text-lc-text-secondary">{spec.description}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-lc-text-secondary">
                      {numericValue.toFixed(spec.kind === "int" ? 0 : 2)}
                      {spec.unit ? ` ${spec.unit}` : ""}
                    </span>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 max-sm:grid-cols-1">
                    <input
                      className="w-full accent-lc-primary"
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
                    <Input
                      className="h-10 text-right font-medium tabular-nums"
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
