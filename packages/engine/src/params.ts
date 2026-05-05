export type ParamCommon = Readonly<{
  label?: string;
  description?: string;
  step?: number;
  group?: string;
  advanced?: boolean;
  unit?: string;
}>;

export type IntParamSpec = ParamCommon &
  Readonly<{
    kind: "int";
    min: number;
    max: number;
    default: number;
  }>;

export type FloatParamSpec = ParamCommon &
  Readonly<{
    kind: "float";
    min: number;
    max: number;
    default: number;
  }>;

export type BoolParamSpec = ParamCommon &
  Readonly<{
    kind: "bool";
    default: boolean;
  }>;

export type ParamSpec = IntParamSpec | FloatParamSpec | BoolParamSpec;

export type ParameterSchema = Readonly<Record<string, ParamSpec>>;

export type ParameterValueForSpec<Spec extends ParamSpec> = Spec extends BoolParamSpec
  ? boolean
  : number;

export type NormalizedParams<Schema extends ParameterSchema> = {
  readonly [Key in keyof Schema]: ParameterValueForSpec<Schema[Key]>;
};

export type NormalizationIssue = Readonly<{
  key: string;
  code: "defaulted" | "clamped" | "invalid";
  message: string;
}>;

const PARAM_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseNumberish(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseBooleanish(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true" || value === "1") {
      return true;
    }

    if (value === "false" || value === "0") {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  return null;
}

export function isParameterKeyValid(key: string): boolean {
  return PARAM_KEY_PATTERN.test(key);
}

export function validateParameterSchema(schema: ParameterSchema): string[] {
  const issues: string[] = [];

  for (const [key, spec] of Object.entries(schema)) {
    if (!isParameterKeyValid(key)) {
      issues.push(`Parameter "${key}" is not an ASCII-safe identifier.`);
    }

    if (spec.kind === "bool") {
      continue;
    }

    if (!Number.isFinite(spec.min) || !Number.isFinite(spec.max) || !Number.isFinite(spec.default)) {
      issues.push(`Parameter "${key}" must use finite numeric bounds and default values.`);
      continue;
    }

    if (spec.min > spec.max) {
      issues.push(`Parameter "${key}" has min > max.`);
    }

    if (spec.kind === "int" && !Number.isInteger(spec.default)) {
      issues.push(`Integer parameter "${key}" must use an integer default.`);
    }

    if (spec.kind === "int" && (!Number.isInteger(spec.min) || !Number.isInteger(spec.max))) {
      issues.push(`Integer parameter "${key}" must use integer min/max bounds.`);
    }

    if (spec.step !== undefined && (!Number.isFinite(spec.step) || spec.step <= 0)) {
      issues.push(`Parameter "${key}" must use a positive step when provided.`);
    }
  }

  return issues;
}

export function normalizeParams<Schema extends ParameterSchema>(
  schema: Schema,
  rawParams: unknown
): Readonly<{
  params: NormalizedParams<Schema>;
  issues: readonly NormalizationIssue[];
}> {
  const candidate =
    rawParams !== null && typeof rawParams === "object"
      ? (rawParams as Record<string, unknown>)
      : {};

  const normalized: Record<string, boolean | number> = {};
  const issues: NormalizationIssue[] = [];

  for (const [key, spec] of Object.entries(schema)) {
    const rawValue = candidate[key];

    if (spec.kind === "bool") {
      const parsed = parseBooleanish(rawValue);
      if (parsed === null) {
        if (rawValue !== undefined) {
          issues.push({
            key,
            code: "invalid",
            message: `Boolean parameter "${key}" was invalid and fell back to its default.`,
          });
        }

        normalized[key] = spec.default;
        continue;
      }

      normalized[key] = parsed;
      continue;
    }

    const parsed = parseNumberish(rawValue);

    if (parsed === null) {
      if (rawValue !== undefined) {
        issues.push({
          key,
          code: "invalid",
          message: `Numeric parameter "${key}" was invalid and fell back to its default.`,
        });
      } else {
        issues.push({
          key,
          code: "defaulted",
          message: `Numeric parameter "${key}" was missing and fell back to its default.`,
        });
      }

      normalized[key] = spec.default;
      continue;
    }

    const coerced = spec.kind === "int" ? Math.round(parsed) : parsed;
    const clamped = clamp(coerced, spec.min, spec.max);

    if (clamped !== coerced) {
      issues.push({
        key,
        code: "clamped",
        message: `Parameter "${key}" was clamped into its declared bounds.`,
      });
    }

    normalized[key] = clamped;
  }

  return {
    params: normalized as NormalizedParams<Schema>,
    issues,
  };
}

