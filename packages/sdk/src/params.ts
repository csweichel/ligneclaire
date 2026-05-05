import type { BoolParamSpec, FloatParamSpec, IntParamSpec, ParamCommon } from "@ligneclaire/engine";

export function intParam(config: Omit<IntParamSpec, "kind">): IntParamSpec {
  return {
    ...config,
    kind: "int",
  };
}

export function floatParam(config: Omit<FloatParamSpec, "kind">): FloatParamSpec {
  return {
    ...config,
    kind: "float",
  };
}

export function boolParam(config: Omit<BoolParamSpec, "kind">): BoolParamSpec {
  return {
    ...config,
    kind: "bool",
  };
}

export type ParamUiHints = ParamCommon;

