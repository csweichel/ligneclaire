import {
  clamp,
  clipPolylineToBounds,
  clipPolylineToPolygon,
  contentBounds,
  createPerlinVectorField,
  createRng,
  distanceBetweenPoints,
  excludePolylineFromPolygon,
  generateDragonCurve,
  generateHamiltonPaths,
  generateHilbertCurve,
  generateMooreCurve,
  generatePeanoCurve,
  generateTerrainSliceGeometry,
  generateVoronoiNestedCells,
  hatchBounds,
  resolveProgramState,
  plotPalette,
  pointInPolygon,
  sampleEpitrochoid,
  sampleFunctionPath,
  sampleGrayscaleImageGrid,
  sampleHypotrochoid,
  traceContinuousVectorField,
  traceNearestVectorField,
  type Bounds,
  type ParameterSchema,
  type PlotLayer,
  type Point,
  type Polygon,
  type Polyline,
  type ProgramDefinition,
} from "@ligneclaire/sdk";
import { goPenSampleGrid } from "@ligneclaire/sdk";
import { nodeComposerProgramRegistry } from "../generated/node-composer-program-registry";
import { generateTextPaths } from "./text";
import {
  decodeSvgMaskData,
  pointInSvgMask,
  svgMaskFrameBounds,
  svgMaskFramePath,
  type SvgMaskFitMode,
  type SvgMaskPlacement,
} from "./svgMask";

export const canvas = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
} as const;

export const nodeComposerParamSchema = {} as const;

const content = contentBounds(canvas);
const contentWidth = content.maxX - content.minX;
const contentHeight = content.maxY - content.minY;
const contentCenter = {
  x: (content.minX + content.maxX) * 0.5,
  y: (content.minY + content.maxY) * 0.5,
} as const;

const graphBounds = {
  minX: 24,
  minY: 24,
  maxX: 1600,
  maxY: 2200,
} as const;

const emptyBounds: Bounds = {
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
};

const MASK_SAMPLE_STEP_MM = 0.75;

export type NodeComposerSchema = typeof nodeComposerParamSchema;

export type NodeCategory = "paths" | "masks" | "process" | "output";
export type NodePortKind = "paths" | "mask";
type BuiltInNodeKind =
  | "program"
  | "line-grid"
  | "line"
  | "perlin-field"
  | "circle-grid"
  | "image-circles"
  | "text"
  | "hamilton-path"
  | "voronoi-nested-cells"
  | "terrain-slice"
  | "trochoid"
  | "mask-circle"
  | "mask-rect"
  | "mask-polygon"
  | "mask-svg"
  | "mask-boolean"
  | "clip-mask"
  | "path-transform"
  | "merge-paths"
  | "output-layer";
export type NodeKind = BuiltInNodeKind;

export type NodeConfigValue = string | number | boolean;
export type NodeConfig = Readonly<Record<string, NodeConfigValue>>;

export type NodeEndpoint = Readonly<{
  nodeId: string;
  portId: string;
}>;

export type NodeConnection = Readonly<{
  from: NodeEndpoint;
  to: NodeEndpoint;
}>;

export type ComposerNode = Readonly<{
  id: string;
  kind: NodeKind;
  position: Point;
  config: NodeConfig;
}>;

export type NodeComposerProgramState = Readonly<{
  nodes: readonly ComposerNode[];
  connections: readonly NodeConnection[];
  selectedNodeId: string | null;
  nextNodeNumber: number;
}>;

export type NodePortSpec = Readonly<{
  id: string;
  label: string;
  kind: NodePortKind;
}>;

type BaseFieldSpec = Readonly<{
  key: string;
  label: string;
  description?: string;
  unit?: string;
}>;

export type IntFieldSpec = BaseFieldSpec &
  Readonly<{
    kind: "int";
    min: number;
    max: number;
    defaultValue: number;
    step?: number;
  }>;

export type FloatFieldSpec = BaseFieldSpec &
  Readonly<{
    kind: "float";
    min: number;
    max: number;
    defaultValue: number;
    step?: number;
  }>;

export type BoolFieldSpec = BaseFieldSpec &
  Readonly<{
    kind: "bool";
    defaultValue: boolean;
  }>;

export type ChoiceFieldOption = Readonly<{
  label: string;
  value: string;
}>;

export type ChoiceFieldSpec = BaseFieldSpec &
  Readonly<{
    kind: "choice";
    defaultValue: string;
    options: readonly ChoiceFieldOption[];
  }>;

export type TextFieldSpec = BaseFieldSpec &
  Readonly<{
    kind: "text";
    defaultValue: string;
    placeholder?: string;
    maxLength?: number;
  }>;

export type NodeFieldSpec =
  | IntFieldSpec
  | FloatFieldSpec
  | BoolFieldSpec
  | ChoiceFieldSpec
  | TextFieldSpec;

export type NodeSpec = Readonly<{
  kind: NodeKind;
  title: string;
  summary: string;
  category: NodeCategory;
  inputs: readonly NodePortSpec[];
  outputs: readonly NodePortSpec[];
  fields: readonly NodeFieldSpec[];
}>;

type MaskShape = Readonly<{
  bounds: Bounds;
  contains: (point: Point) => boolean;
  outlines: readonly Polyline[];
  polygon?: Polygon;
}>;

type PathsRuntimeValue = Readonly<{
  kind: "paths";
  paths: readonly Polyline[];
}>;

type MaskRuntimeValue = Readonly<{
  kind: "mask";
  mask: MaskShape;
}>;

type RuntimeValue = PathsRuntimeValue | MaskRuntimeValue;
type RuntimeOutputs = Readonly<Record<string, RuntimeValue | undefined>>;

type EmbeddedProgram = ProgramDefinition<ParameterSchema, unknown>;
export type EmbeddedProgramParamSet = Readonly<{
  slug: string;
  name: string;
  params: Readonly<Record<string, unknown>>;
  programState?: unknown;
}>;
export type EmbeddedProgramEntry = Readonly<{
  program: EmbeddedProgram;
  paramSets: readonly EmbeddedProgramParamSet[];
}>;

type EvaluationContext = Readonly<{
  nodesById: ReadonlyMap<string, ComposerNode>;
  incomingByInputKey: ReadonlyMap<string, NodeConnection>;
  mode: "preview" | "export" | "validation";
}>;

function intField(config: Omit<IntFieldSpec, "kind">): IntFieldSpec {
  return {
    ...config,
    kind: "int",
  };
}

function floatField(config: Omit<FloatFieldSpec, "kind">): FloatFieldSpec {
  return {
    ...config,
    kind: "float",
  };
}

function boolField(config: Omit<BoolFieldSpec, "kind">): BoolFieldSpec {
  return {
    ...config,
    kind: "bool",
  };
}

function choiceField(config: Omit<ChoiceFieldSpec, "kind">): ChoiceFieldSpec {
  return {
    ...config,
    kind: "choice",
  };
}

function textField(config: Omit<TextFieldSpec, "kind">): TextFieldSpec {
  return {
    ...config,
    kind: "text",
  };
}

const embeddedProgramEntries =
  nodeComposerProgramRegistry as unknown as readonly EmbeddedProgramEntry[];
const embeddedProgramEntriesById = new Map(
  embeddedProgramEntries.map((entry) => [entry.program.id, entry])
);
const defaultEmbeddedProgramEntry = embeddedProgramEntries[0] ?? null;
export const programNodeProgramStateFieldKey = "programStateJson";

function getEmbeddedProgramEntry(programId: string): EmbeddedProgramEntry | null {
  return embeddedProgramEntriesById.get(programId) ?? null;
}

function getEmbeddedProgram(programId: string): EmbeddedProgram | null {
  return getEmbeddedProgramEntry(programId)?.program ?? null;
}

function getEmbeddedProgramParamSet(
  programId: string,
  slug: string
): EmbeddedProgramParamSet | null {
  return (
    getEmbeddedProgramEntry(programId)?.paramSets.find((paramSet) => paramSet.slug === slug) ??
    null
  );
}

function resolveEmbeddedProgramId(value: unknown): string {
  const candidate = readString(value, defaultEmbeddedProgramEntry?.program.id ?? "");
  return getEmbeddedProgram(candidate)?.id ?? defaultEmbeddedProgramEntry?.program.id ?? "";
}

function parseNodeConfigJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeProgramNodeStateOverride(
  program: EmbeddedProgram,
  params: Readonly<Record<string, number | boolean>>,
  input: unknown
): string | null {
  const candidate = readString(input, "").trim();
  if (candidate.length === 0) {
    return null;
  }

  const parsed = parseNodeConfigJson(candidate);
  if (parsed === null) {
    return null;
  }

  try {
    return JSON.stringify(resolveProgramState(program, params as never, parsed));
  } catch {
    return null;
  }
}

function programNodeParamSet(config: NodeConfig): EmbeddedProgramParamSet | null {
  const programId = programNodeProgramId(config);
  return getEmbeddedProgramParamSet(programId, readString(config.paramSetId, ""));
}

function programNodeStateOverrideInput(config: NodeConfig): unknown | undefined {
  const candidate = readString(config[programNodeProgramStateFieldKey], "").trim();
  if (candidate.length === 0) {
    return undefined;
  }

  return parseNodeConfigJson(candidate) ?? undefined;
}

function isNodeKind(kind: string): kind is NodeKind {
  return kind in builtInNodeSpecs;
}

function regionFields(defaults: Readonly<{
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}>): readonly NodeFieldSpec[] {
  return [
    floatField({
      key: "centerX",
      label: "Center X",
      min: content.minX,
      max: content.maxX,
      defaultValue: defaults.centerX,
      step: 1,
      unit: "mm",
    }),
    floatField({
      key: "centerY",
      label: "Center Y",
      min: content.minY,
      max: content.maxY,
      defaultValue: defaults.centerY,
      step: 1,
      unit: "mm",
    }),
    floatField({
      key: "width",
      label: "Width",
      min: 16,
      max: contentWidth,
      defaultValue: defaults.width,
      step: 1,
      unit: "mm",
    }),
    floatField({
      key: "height",
      label: "Height",
      min: 16,
      max: contentHeight,
      defaultValue: defaults.height,
      step: 1,
      unit: "mm",
    }),
  ];
}

function centerFields(defaults: Readonly<{ centerX: number; centerY: number }>): readonly NodeFieldSpec[] {
  return [
    floatField({
      key: "centerX",
      label: "Center X",
      min: content.minX,
      max: content.maxX,
      defaultValue: defaults.centerX,
      step: 1,
      unit: "mm",
    }),
    floatField({
      key: "centerY",
      label: "Center Y",
      min: content.minY,
      max: content.maxY,
      defaultValue: defaults.centerY,
      step: 1,
      unit: "mm",
    }),
  ];
}

const outputStyleOptions = [
  { label: "Primary", value: "primary" },
  { label: "Accent", value: "accent" },
  { label: "Mask", value: "mask" },
  { label: "Water", value: "water" },
] as const satisfies readonly ChoiceFieldOption[];

const booleanMaskOptions = [
  { label: "Union", value: "union" },
  { label: "Intersection", value: "intersection" },
  { label: "Subtract", value: "subtract" },
  { label: "Difference", value: "xor" },
] as const satisfies readonly ChoiceFieldOption[];

const clipModeOptions = [
  { label: "Clip", value: "clip" },
  { label: "Exclude", value: "exclude" },
] as const satisfies readonly ChoiceFieldOption[];

const fitModeOptions = [
  { label: "Contain", value: "contain" },
  { label: "Stretch", value: "stretch" },
] as const satisfies readonly ChoiceFieldOption[];

const lineStyleOptions = [
  { label: "Solid", value: "solid" },
  { label: "Dashed", value: "dashed" },
] as const satisfies readonly ChoiceFieldOption[];

const textFillPatternOptions = [
  { label: "Outline", value: "outline" },
  { label: "Hatch", value: "hatch" },
  { label: "Cross Hatch", value: "cross-hatch" },
  { label: "Continual Inset", value: "inset" },
  { label: "Hilbert", value: "hilbert" },
  { label: "Moore", value: "moore" },
  { label: "Peano", value: "peano" },
  { label: "Dragon", value: "dragon" },
] as const satisfies readonly ChoiceFieldOption[];

function humanizeProgramFieldKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function fieldForProgramParam(
  key: string,
  spec: EmbeddedProgram["params"][string]
): IntFieldSpec | FloatFieldSpec | BoolFieldSpec {
  const shared = {
    key,
    label: spec.label ?? humanizeProgramFieldKey(key),
    description: spec.description,
    unit: spec.unit,
  } as const;

  if (spec.kind === "bool") {
    return boolField({
      ...shared,
      defaultValue: spec.default,
    });
  }

  if (spec.kind === "int") {
    return intField({
      ...shared,
      min: spec.min,
      max: spec.max,
      defaultValue: spec.default,
      step: spec.step,
    });
  }

  return floatField({
    ...shared,
    min: spec.min,
    max: spec.max,
    defaultValue: spec.default,
    step: spec.step,
  });
}

export const programNodePrograms: readonly Readonly<{
  id: string;
  title: string;
  description: string;
}>[] = embeddedProgramEntries.map((entry) => ({
  id: entry.program.id,
  title: entry.program.title,
  description: entry.program.description,
}));

export function programNodeParamSets(programId: string): readonly EmbeddedProgramParamSet[] {
  return getEmbeddedProgramEntry(programId)?.paramSets ?? [];
}

export function programNodeProgramId(config: NodeConfig): string {
  return resolveEmbeddedProgramId(config.programId);
}

export function programNodeProgram(config: NodeConfig): EmbeddedProgram | null {
  return getEmbeddedProgram(programNodeProgramId(config));
}

export function programNodeHasProgramStateOverride(config: NodeConfig): boolean {
  return readString(config[programNodeProgramStateFieldKey], "").trim().length > 0;
}

export function programNodeResolvedProgramState(config: NodeConfig): unknown {
  const program = programNodeProgram(config);
  if (!program) {
    return null;
  }

  const paramSet = programNodeParamSet(config);
  const params = programNodeParams(program, config, paramSet);
  const programStateInput = programNodeStateOverrideInput(config) ?? paramSet?.programState;
  return resolveProgramState(program, params as never, programStateInput);
}

export function programNodeParamFields(config: NodeConfig): readonly NodeFieldSpec[] {
  const program = programNodeProgram(config);
  if (!program) {
    return [];
  }

  return Object.entries(program.params).map(([key, spec]) => fieldForProgramParam(key, spec));
}

const builtInNodeSpecs = {
  program: {
    kind: "program",
    title: "Program",
    summary:
      "Run any checked-in program as a path generator, then optionally prefill it from an existing parameter set.",
    category: "paths",
    inputs: [],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [],
  },
  "line-grid": {
    kind: "line-grid",
    title: "Line Grid",
    summary: "Parallel hatch lines clipped to a rectangular region.",
    category: "paths",
    inputs: [],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [
      ...regionFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
        width: 150,
        height: 220,
      }),
      floatField({
        key: "spacing",
        label: "Spacing",
        min: 1,
        max: 32,
        defaultValue: 7,
        step: 0.25,
        unit: "mm",
      }),
      floatField({
        key: "angleDeg",
        label: "Angle",
        min: 0,
        max: 180,
        defaultValue: 24,
        step: 1,
        unit: "deg",
      }),
    ],
  },
  line: {
    kind: "line",
    title: "Line",
    summary: "A centered line segment rendered as either a solid or dashed band of parallel strokes.",
    category: "paths",
    inputs: [],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [
      ...centerFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
      }),
      floatField({
        key: "length",
        label: "Length",
        min: 4,
        max: contentWidth,
        defaultValue: 120,
        step: 1,
        unit: "mm",
      }),
      floatField({
        key: "angleDeg",
        label: "Angle",
        min: -180,
        max: 180,
        defaultValue: 0,
        step: 1,
        unit: "deg",
      }),
      choiceField({
        key: "style",
        label: "Style",
        defaultValue: "solid",
        options: lineStyleOptions,
      }),
      floatField({
        key: "thickness",
        label: "Thickness",
        min: 0.35,
        max: 24,
        defaultValue: 1.2,
        step: 0.05,
        unit: "mm",
      }),
      floatField({
        key: "dashLength",
        label: "Dash Length",
        min: 0.5,
        max: 40,
        defaultValue: 10,
        step: 0.25,
        unit: "mm",
      }),
      floatField({
        key: "dashGap",
        label: "Dash Gap",
        min: 0.25,
        max: 40,
        defaultValue: 5,
        step: 0.25,
        unit: "mm",
      }),
    ],
  },
  "perlin-field": {
    kind: "perlin-field",
    title: "Perlin Field",
    summary: "Flow-field traces sampled inside a rectangular region.",
    category: "paths",
    inputs: [],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [
      ...regionFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
        width: 118,
        height: 118,
      }),
      intField({
        key: "seed",
        label: "Seed",
        min: 1,
        max: 999999,
        defaultValue: 4589,
      }),
      intField({
        key: "paths",
        label: "Paths",
        min: 12,
        max: 1200,
        defaultValue: 180,
      }),
      floatField({
        key: "segmentLength",
        label: "Segment Length",
        min: 0.5,
        max: 8,
        defaultValue: 2.25,
        step: 0.1,
        unit: "mm",
      }),
      intField({
        key: "steps",
        label: "Steps",
        min: 2,
        max: 48,
        defaultValue: 10,
      }),
      intField({
        key: "columns",
        label: "Field Columns",
        min: 4,
        max: 64,
        defaultValue: 20,
      }),
      intField({
        key: "rows",
        label: "Field Rows",
        min: 4,
        max: 64,
        defaultValue: 20,
      }),
      floatField({
        key: "frequency",
        label: "Frequency",
        min: 0.25,
        max: 8,
        defaultValue: 2.5,
        step: 0.05,
      }),
      boolField({
        key: "continuousCurves",
        label: "Continuous Curves",
        defaultValue: true,
      }),
    ],
  },
  "circle-grid": {
    kind: "circle-grid",
    title: "Circle Grid",
    summary: "A regular grid of circles within a rectangular region.",
    category: "paths",
    inputs: [],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [
      ...regionFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
        width: 130,
        height: 170,
      }),
      intField({
        key: "columns",
        label: "Columns",
        min: 2,
        max: 24,
        defaultValue: 6,
      }),
      intField({
        key: "rows",
        label: "Rows",
        min: 2,
        max: 24,
        defaultValue: 8,
      }),
      floatField({
        key: "radius",
        label: "Radius",
        min: 0.5,
        max: 24,
        defaultValue: 5.5,
        step: 0.1,
        unit: "mm",
      }),
      intField({
        key: "segments",
        label: "Segments",
        min: 12,
        max: 120,
        defaultValue: 48,
      }),
    ],
  },
  "image-circles": {
    kind: "image-circles",
    title: "Image Circles",
    summary: "Sample the bundled reference image into hatched circles.",
    category: "paths",
    inputs: [],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [
      ...regionFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
        width: 136,
        height: 182,
      }),
      intField({
        key: "columns",
        label: "Columns",
        min: 6,
        max: 64,
        defaultValue: 22,
      }),
      intField({
        key: "rows",
        label: "Rows",
        min: 6,
        max: 72,
        defaultValue: 30,
      }),
      floatField({
        key: "maxRadius",
        label: "Max Radius",
        min: 0.5,
        max: 8,
        defaultValue: 2.8,
        step: 0.1,
        unit: "mm",
      }),
      floatField({
        key: "minHatchSpacing",
        label: "Min Hatch",
        min: 0.2,
        max: 3,
        defaultValue: 0.65,
        step: 0.025,
        unit: "mm",
      }),
      floatField({
        key: "maxHatchSpacing",
        label: "Max Hatch",
        min: 0.4,
        max: 4,
        defaultValue: 1.8,
        step: 0.025,
        unit: "mm",
      }),
    ],
  },
  text: {
    kind: "text",
    title: "Text",
    summary:
      "Outlined or pattern-filled text from bundled Google fonts, with adjustable size, weight, and rotation.",
    category: "paths",
    inputs: [],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [
      ...centerFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
      }),
      textField({
        key: "text",
        label: "Text",
        defaultValue: "Ligne Claire",
        placeholder: "Plot text",
        maxLength: 80,
      }),
      textField({
        key: "fontId",
        label: "Font",
        defaultValue: "inter",
        placeholder: "Search Google Fonts",
        maxLength: 120,
      }),
      floatField({
        key: "fontSize",
        label: "Size",
        min: 4,
        max: 96,
        defaultValue: 24,
        step: 0.5,
        unit: "mm",
      }),
      intField({
        key: "fontWeight",
        label: "Weight",
        min: 100,
        max: 900,
        defaultValue: 400,
        step: 50,
      }),
      floatField({
        key: "rotationDeg",
        label: "Rotation",
        min: -180,
        max: 180,
        defaultValue: 0,
        step: 1,
        unit: "deg",
      }),
      choiceField({
        key: "fillPattern",
        label: "Fill Pattern",
        defaultValue: "outline",
        options: textFillPatternOptions,
      }),
      boolField({
        key: "includeOutline",
        label: "Include Outline",
        defaultValue: true,
      }),
      floatField({
        key: "fillSpacing",
        label: "Fill Spacing",
        min: 0.35,
        max: 24,
        defaultValue: 3.6,
        step: 0.05,
        unit: "mm",
      }),
      floatField({
        key: "fillAngleDeg",
        label: "Fill Angle",
        min: -180,
        max: 180,
        defaultValue: 45,
        step: 1,
        unit: "deg",
      }),
      intField({
        key: "curveOrder",
        label: "Curve Order",
        min: 1,
        max: 6,
        defaultValue: 4,
      }),
    ],
  },
  "hamilton-path": {
    kind: "hamilton-path",
    title: "Hamilton Path",
    summary: "A seeded Hamiltonian lattice walk rendered as parallel strokes, with an optional mask domain.",
    category: "paths",
    inputs: [{ id: "domain", label: "Domain", kind: "mask" }],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [
      ...regionFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
        width: 150,
        height: 220,
      }),
      intField({
        key: "seed",
        label: "Seed",
        min: 1,
        max: 999999,
        defaultValue: 2417,
      }),
      intField({
        key: "columns",
        label: "Columns",
        min: 2,
        max: 60,
        defaultValue: 18,
      }),
      intField({
        key: "rows",
        label: "Rows",
        min: 2,
        max: 90,
        defaultValue: 28,
      }),
      floatField({
        key: "gridRotationDeg",
        label: "Grid Rotation",
        min: -180,
        max: 180,
        defaultValue: 0,
        step: 0.5,
        unit: "deg",
      }),
      floatField({
        key: "latticeAngleDeg",
        label: "Lattice Angle",
        min: 15,
        max: 165,
        defaultValue: 90,
        step: 0.5,
        unit: "deg",
      }),
      floatField({
        key: "rowStepRatio",
        label: "Row Step Ratio",
        min: 0.2,
        max: 4,
        defaultValue: 1,
        step: 0.02,
      }),
      intField({
        key: "strokeCount",
        label: "Parallel Strokes",
        min: 1,
        max: 12,
        defaultValue: 3,
      }),
      floatField({
        key: "strokeSpacing",
        label: "Stroke Gap",
        min: 0.2,
        max: 12,
        defaultValue: 0.62,
        step: 0.02,
        unit: "mm",
      }),
      floatField({
        key: "cornerRadius",
        label: "Corner Radius",
        min: 0,
        max: 24,
        defaultValue: 1.1,
        step: 0.05,
        unit: "mm",
      }),
      floatField({
        key: "deflection",
        label: "Deflection",
        min: 0,
        max: 8,
        defaultValue: 0,
        step: 0.05,
        unit: "mm",
      }),
      boolField({
        key: "drawCenterlines",
        label: "Draw Centerlines",
        defaultValue: false,
      }),
    ],
  },
  "voronoi-nested-cells": {
    kind: "voronoi-nested-cells",
    title: "Voronoi Nested Cells",
    summary:
      "Scatter seeded Voronoi cells inside a rectangular region, fillet them, then emit nested scaled and rotated closed loops.",
    category: "paths",
    inputs: [],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [
      ...regionFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
        width: 150,
        height: 220,
      }),
      intField({
        key: "pointCount",
        label: "Point Count",
        min: 1,
        max: 200,
        defaultValue: 51,
      }),
      intField({
        key: "randomSeed",
        label: "Random Seed",
        min: 1,
        max: 999999,
        defaultValue: 20,
      }),
      floatField({
        key: "filletRadius",
        label: "Fillet Radius",
        min: 0,
        max: 200,
        defaultValue: 100,
        step: 1,
        unit: "mm",
      }),
      intField({
        key: "layerCount",
        label: "Layer Count",
        min: 1,
        max: 24,
        defaultValue: 10,
      }),
      floatField({
        key: "scaleBase",
        label: "Scale Base",
        min: 0.1,
        max: 1.2,
        defaultValue: 0.9,
        step: 0.01,
      }),
      floatField({
        key: "rotationStep",
        label: "Rotation Step",
        min: -14,
        max: 14,
        defaultValue: 7,
        step: 0.05,
        unit: "rad",
      }),
    ],
  },
  "terrain-slice": {
    kind: "terrain-slice",
    title: "Terrain Slice",
    summary: "A line-based hill slice with separate terrain and water outputs.",
    category: "paths",
    inputs: [],
    outputs: [
      { id: "terrain", label: "Terrain", kind: "paths" },
      { id: "water", label: "Water", kind: "paths" },
    ],
    fields: [
      ...regionFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
        width: 118,
        height: 92,
      }),
      floatField({
        key: "terrainOffsetX",
        label: "Terrain X",
        min: -48,
        max: 48,
        defaultValue: 0,
        step: 0.5,
        unit: "mm",
      }),
      floatField({
        key: "terrainOffsetY",
        label: "Terrain Y",
        min: -48,
        max: 48,
        defaultValue: 0,
        step: 0.5,
        unit: "mm",
      }),
      intField({
        key: "seed",
        label: "Seed",
        min: 1,
        max: 999999,
        defaultValue: 2812,
      }),
      intField({
        key: "contourLevels",
        label: "Contour Levels",
        min: 4,
        max: 24,
        defaultValue: 12,
      }),
      floatField({
        key: "mountainScale",
        label: "Mountain Scale",
        min: 0.35,
        max: 0.95,
        defaultValue: 0.9,
        step: 0.01,
      }),
      floatField({
        key: "relief",
        label: "Relief",
        min: 6,
        max: 96,
        defaultValue: 44,
        step: 0.5,
        unit: "mm",
      }),
      floatField({
        key: "waterLevel",
        label: "Water Level",
        min: 0,
        max: 1,
        defaultValue: 0.42,
        step: 0.01,
      }),
      floatField({
        key: "roughness",
        label: "Roughness",
        min: 0,
        max: 1,
        defaultValue: 0.62,
        step: 0.01,
      }),
      floatField({
        key: "hatchSpacing",
        label: "Terrain Hatch",
        min: 0.3,
        max: 2.5,
        defaultValue: 0.88,
        step: 0.02,
        unit: "mm",
      }),
      floatField({
        key: "waterSpacing",
        label: "Water Hatch",
        min: 0.2,
        max: 2,
        defaultValue: 0.62,
        step: 0.02,
        unit: "mm",
      }),
    ],
  },
  trochoid: {
    kind: "trochoid",
    title: "Trochoid",
    summary: "A hypotrochoid or epitrochoid figure placed on the sheet.",
    category: "paths",
    inputs: [],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [
      ...centerFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
      }),
      boolField({
        key: "useEpitrochoid",
        label: "Use Epitrochoid",
        defaultValue: false,
      }),
      intField({
        key: "fixedRadius",
        label: "Fixed Radius",
        min: 12,
        max: 144,
        defaultValue: 72,
        unit: "mm",
      }),
      intField({
        key: "rollingRadius",
        label: "Rolling Radius",
        min: 3,
        max: 72,
        defaultValue: 24,
        unit: "mm",
      }),
      floatField({
        key: "pointOffsetRatio",
        label: "Offset Ratio",
        min: 0,
        max: 2,
        defaultValue: 0.9,
        step: 0.01,
      }),
      floatField({
        key: "figureRadius",
        label: "Figure Radius",
        min: 8,
        max: 180,
        defaultValue: 42,
        step: 0.5,
        unit: "mm",
      }),
      floatField({
        key: "rotationDeg",
        label: "Rotation",
        min: 0,
        max: 360,
        defaultValue: 0,
        step: 1,
        unit: "deg",
      }),
      intField({
        key: "samplesPerTurn",
        label: "Samples / Turn",
        min: 48,
        max: 720,
        defaultValue: 240,
      }),
    ],
  },
  "mask-circle": {
    kind: "mask-circle",
    title: "Circle Mask",
    summary: "A circular mask that can be combined or applied to paths.",
    category: "masks",
    inputs: [],
    outputs: [{ id: "mask", label: "Mask", kind: "mask" }],
    fields: [
      ...centerFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
      }),
      floatField({
        key: "radius",
        label: "Radius",
        min: 4,
        max: 180,
        defaultValue: 54,
        step: 0.5,
        unit: "mm",
      }),
    ],
  },
  "mask-rect": {
    kind: "mask-rect",
    title: "Rectangle Mask",
    summary: "A rectangular mask with optional rotation.",
    category: "masks",
    inputs: [],
    outputs: [{ id: "mask", label: "Mask", kind: "mask" }],
    fields: [
      ...regionFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
        width: 120,
        height: 160,
      }),
      floatField({
        key: "rotationDeg",
        label: "Rotation",
        min: 0,
        max: 360,
        defaultValue: 0,
        step: 1,
        unit: "deg",
      }),
    ],
  },
  "mask-polygon": {
    kind: "mask-polygon",
    title: "Polygon Mask",
    summary: "A regular polygon mask for union, subtraction, and clipping.",
    category: "masks",
    inputs: [],
    outputs: [{ id: "mask", label: "Mask", kind: "mask" }],
    fields: [
      ...centerFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
      }),
      floatField({
        key: "radius",
        label: "Radius",
        min: 4,
        max: 180,
        defaultValue: 44,
        step: 0.5,
        unit: "mm",
      }),
      intField({
        key: "sides",
        label: "Sides",
        min: 3,
        max: 12,
        defaultValue: 6,
      }),
      floatField({
        key: "rotationDeg",
        label: "Rotation",
        min: 0,
        max: 360,
        defaultValue: 0,
        step: 1,
        unit: "deg",
      }),
    ],
  },
  "mask-svg": {
    kind: "mask-svg",
    title: "SVG Mask",
    summary: "Load an SVG silhouette and reuse it as a clip or mask input.",
    category: "masks",
    inputs: [],
    outputs: [{ id: "mask", label: "Mask", kind: "mask" }],
    fields: [
      ...regionFields({
        centerX: contentCenter.x,
        centerY: contentCenter.y,
        width: 120,
        height: 120,
      }),
      choiceField({
        key: "fitMode",
        label: "Fit",
        defaultValue: "contain",
        options: fitModeOptions,
      }),
      floatField({
        key: "rotationDeg",
        label: "Rotation",
        min: -180,
        max: 180,
        defaultValue: 0,
        step: 1,
        unit: "deg",
      }),
    ],
  },
  "mask-boolean": {
    kind: "mask-boolean",
    title: "Mask Boolean",
    summary: "Combine two masks with union, intersection, subtraction, or difference.",
    category: "process",
    inputs: [
      { id: "a", label: "Mask A", kind: "mask" },
      { id: "b", label: "Mask B", kind: "mask" },
    ],
    outputs: [{ id: "mask", label: "Mask", kind: "mask" }],
    fields: [
      choiceField({
        key: "operation",
        label: "Operation",
        defaultValue: "union",
        options: booleanMaskOptions,
      }),
    ],
  },
  "clip-mask": {
    kind: "clip-mask",
    title: "Clip Mask",
    summary: "Clip or exclude paths using a mask input.",
    category: "process",
    inputs: [
      { id: "paths", label: "Paths", kind: "paths" },
      { id: "mask", label: "Mask", kind: "mask" },
    ],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [
      choiceField({
        key: "mode",
        label: "Mode",
        defaultValue: "clip",
        options: clipModeOptions,
      }),
    ],
  },
  "path-transform": {
    kind: "path-transform",
    title: "Path Transform",
    summary: "Translate, scale, and rotate a path stream around its shared bounds center.",
    category: "process",
    inputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [
      floatField({
        key: "translateX",
        label: "Move X",
        min: -contentWidth,
        max: contentWidth,
        defaultValue: 0,
        step: 0.5,
        unit: "mm",
      }),
      floatField({
        key: "translateY",
        label: "Move Y",
        min: -contentHeight,
        max: contentHeight,
        defaultValue: 0,
        step: 0.5,
        unit: "mm",
      }),
      floatField({
        key: "scaleX",
        label: "Scale X",
        min: 0.1,
        max: 4,
        defaultValue: 1,
        step: 0.05,
      }),
      floatField({
        key: "scaleY",
        label: "Scale Y",
        min: 0.1,
        max: 4,
        defaultValue: 1,
        step: 0.05,
      }),
      floatField({
        key: "rotationDeg",
        label: "Rotation",
        min: -180,
        max: 180,
        defaultValue: 0,
        step: 1,
        unit: "deg",
      }),
    ],
  },
  "merge-paths": {
    kind: "merge-paths",
    title: "Merge Paths",
    summary: "Concatenate two path streams into one output.",
    category: "process",
    inputs: [
      { id: "a", label: "Paths A", kind: "paths" },
      { id: "b", label: "Paths B", kind: "paths" },
    ],
    outputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    fields: [],
  },
  "output-layer": {
    kind: "output-layer",
    title: "Output Layer",
    summary: "Emit a path stream into a named plotted layer.",
    category: "output",
    inputs: [{ id: "paths", label: "Paths", kind: "paths" }],
    outputs: [],
    fields: [
      choiceField({
        key: "style",
        label: "Style",
        defaultValue: "primary",
        options: outputStyleOptions,
      }),
      textField({
        key: "label",
        label: "Layer Label",
        defaultValue: "Layer",
        placeholder: "Layer",
        maxLength: 48,
      }),
      boolField({
        key: "enabled",
        label: "Enabled",
        defaultValue: true,
      }),
    ],
  },
} as const satisfies Record<BuiltInNodeKind, NodeSpec>;

export const nodeSpecs = Object.freeze({
  ...builtInNodeSpecs,
}) as Readonly<Record<NodeKind, NodeSpec>>;

export function nodeSpec(kind: NodeKind): NodeSpec {
  const spec = nodeSpecs[kind];
  if (!spec) {
    throw new Error(`Unknown node kind "${kind}".`);
  }

  return spec;
}

export const nodeCategories = [
  { id: "paths", label: "Path Generators" },
  { id: "masks", label: "Masks" },
  { id: "process", label: "Processing" },
  { id: "output", label: "Output" },
] as const satisfies readonly Readonly<{ id: NodeCategory; label: string }>[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function fieldDefaultValue(field: NodeFieldSpec): NodeConfigValue {
  return field.defaultValue;
}

function normalizeFieldValue(field: NodeFieldSpec, input: unknown): NodeConfigValue {
  if (field.kind === "bool") {
    return readBoolean(input, field.defaultValue);
  }

  if (field.kind === "choice") {
    const candidate = readString(input, field.defaultValue);
    return field.options.some((option) => option.value === candidate)
      ? candidate
      : field.defaultValue;
  }

  if (field.kind === "text") {
    const candidate = readString(input, field.defaultValue).trim();
    const safe = candidate.length > 0 ? candidate : field.defaultValue;
    return safe.slice(0, field.maxLength ?? 64);
  }

  const fallback = field.defaultValue;
  const raw = readNumber(input, fallback);
  const clampedValue = clamp(raw, field.min, field.max);
  return field.kind === "int" ? Math.round(clampedValue) : clampedValue;
}

function normalizeProgramNodeConfig(input: unknown): NodeConfig {
  const candidate = isRecord(input) ? input : {};
  const programId = resolveEmbeddedProgramId(candidate.programId);
  const program = getEmbeddedProgram(programId) ?? defaultEmbeddedProgramEntry?.program ?? null;

  if (!program) {
    return {};
  }

  const requestedParamSetId = readString(candidate.paramSetId, "");
  const paramSet = getEmbeddedProgramParamSet(programId, requestedParamSetId);
  const normalized: Record<string, NodeConfigValue> = {
    programId,
    paramSetId: paramSet?.slug ?? "",
  };

  for (const [key, spec] of Object.entries(program.params)) {
    const field = fieldForProgramParam(key, spec);
    normalized[key] = normalizeFieldValue(
      field,
      candidate[key] !== undefined ? candidate[key] : paramSet?.params[key]
    );
  }

  const params = programNodeParams(program, normalized, paramSet);
  const programStateOverride = normalizeProgramNodeStateOverride(
    program,
    params,
    candidate[programNodeProgramStateFieldKey]
  );
  if (programStateOverride) {
    normalized[programNodeProgramStateFieldKey] = programStateOverride;
  }

  return normalized;
}

function normalizeConfigForSpec(kind: NodeKind, input: unknown): NodeConfig {
  if (kind === "program") {
    return normalizeProgramNodeConfig(input);
  }

  const spec = nodeSpec(kind);
  const candidate = isRecord(input) ? input : {};
  const normalized: Record<string, NodeConfigValue> = {};

  for (const field of spec.fields) {
    normalized[field.key] = normalizeFieldValue(field, candidate[field.key]);
  }

  if (kind === "trochoid") {
    const useEpitrochoid = Boolean(normalized.useEpitrochoid);
    const fixedRadius = Number(normalized.fixedRadius);
    const maxRollingRadius = useEpitrochoid ? 72 : Math.max(3, Math.min(72, fixedRadius - 1));
    normalized.rollingRadius = Math.round(
      clamp(Number(normalized.rollingRadius), 3, maxRollingRadius)
    );
  }

  if (kind === "image-circles") {
    const minSpacing = Number(normalized.minHatchSpacing);
    normalized.maxHatchSpacing = Math.max(minSpacing + 0.1, Number(normalized.maxHatchSpacing));
  }

  if (kind === "text") {
    const fontCacheKey = readString(candidate.fontCacheKey, "").trim();
    const fontDataBase64 = readString(candidate.fontDataBase64, "").trim();
    const fontResolvedWeight = Math.round(readNumber(candidate.fontResolvedWeight, 0));
    const fontRequestedWeight = Math.round(readNumber(candidate.fontRequestedWeight, 0));

    if (fontCacheKey.length > 0) {
      normalized.fontCacheKey = fontCacheKey;
    }

    if (fontDataBase64.length > 0) {
      normalized.fontDataBase64 = fontDataBase64;
    }

    if (fontResolvedWeight > 0) {
      normalized.fontResolvedWeight = fontResolvedWeight;
    }

    if (fontRequestedWeight > 0) {
      normalized.fontRequestedWeight = fontRequestedWeight;
    }
  }

  if (kind === "mask-svg") {
    const svgMaskSourceName = readString(candidate.svgMaskSourceName, "").trim();
    const svgMaskDataBase64 = readString(candidate.svgMaskDataBase64, "").trim();

    if (svgMaskSourceName.length > 0) {
      normalized.svgMaskSourceName = svgMaskSourceName.slice(0, 128);
    }

    if (decodeSvgMaskData(svgMaskDataBase64)) {
      normalized.svgMaskDataBase64 = svgMaskDataBase64;
    }
  }

  if (kind === "output-layer") {
    const label = String(normalized.label ?? "").trim();
    normalized.label = label.length > 0 ? label.slice(0, 48) : "Layer";
  }

  return normalized;
}

function normalizePoint(candidate: unknown, fallback: Point): Point {
  const record = isRecord(candidate) ? candidate : {};

  return {
    x: clamp(readNumber(record.x, fallback.x), graphBounds.minX, graphBounds.maxX),
    y: clamp(readNumber(record.y, fallback.y), graphBounds.minY, graphBounds.maxY),
  };
}

function nodeId(number: number): string {
  return `node-${number}`;
}

function createNode(
  kind: NodeKind,
  number: number,
  position: Point,
  config?: unknown
): ComposerNode {
  return {
    id: nodeId(number),
    kind,
    position: normalizePoint(position, position),
    config: normalizeConfigForSpec(kind, config),
  };
}

function displayNameForKind(kind: NodeKind): string {
  return nodeSpec(kind).title;
}

function deriveNextNodeNumber(nodes: readonly ComposerNode[]): number {
  let highest = 0;

  for (const node of nodes) {
    const match = /^node-(\d+)$/.exec(node.id);
    if (!match) {
      continue;
    }
    highest = Math.max(highest, Number(match[1]));
  }

  return Math.max(highest + 1, nodes.length + 1, 2);
}

function normalizeNodeId(
  input: unknown,
  fallbackNumber: number,
  usedIds: Set<string>
): string {
  const fallback = nodeId(fallbackNumber);
  const requested =
    typeof input === "string" && /^[A-Za-z0-9_-]+$/.test(input) ? input : fallback;
  let unique = requested;
  let suffix = 2;

  while (usedIds.has(unique)) {
    unique = `${requested}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(unique);
  return unique;
}

function connectionKey(connection: NodeConnection): string {
  return `${connection.from.nodeId}:${connection.from.portId}->${connection.to.nodeId}:${connection.to.portId}`;
}

function inputKey(nodeId: string, portId: string): string {
  return `${nodeId}:${portId}`;
}

function findPort(specs: readonly NodePortSpec[], portId: string): NodePortSpec | null {
  return specs.find((port) => port.id === portId) ?? null;
}

function getIncomingConnection(
  connections: readonly NodeConnection[],
  nodeId: string,
  portId: string
): NodeConnection | null {
  return (
    connections.find(
      (connection) =>
        connection.to.nodeId === nodeId && connection.to.portId === portId
    ) ?? null
  );
}

function nodeExists(nodes: readonly ComposerNode[], nodeId: string): boolean {
  return nodes.some((node) => node.id === nodeId);
}

function outgoingTargets(connections: readonly NodeConnection[], nodeId: string): readonly string[] {
  return connections
    .filter((connection) => connection.from.nodeId === nodeId)
    .map((connection) => connection.to.nodeId);
}

function hasPathBetween(
  connections: readonly NodeConnection[],
  fromNodeId: string,
  toNodeId: string,
  visited = new Set<string>()
): boolean {
  if (fromNodeId === toNodeId) {
    return true;
  }

  if (visited.has(fromNodeId)) {
    return false;
  }

  visited.add(fromNodeId);

  for (const target of outgoingTargets(connections, fromNodeId)) {
    if (hasPathBetween(connections, target, toNodeId, visited)) {
      return true;
    }
  }

  return false;
}

function normalizeConnections(
  input: unknown,
  nodes: readonly ComposerNode[]
): readonly NodeConnection[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const usedInputs = new Set<string>();
  const usedConnections = new Set<string>();
  const normalized: NodeConnection[] = [];

  for (const candidate of input) {
    if (!isRecord(candidate) || !isRecord(candidate.from) || !isRecord(candidate.to)) {
      continue;
    }

    const fromNodeId = readString(candidate.from.nodeId, "");
    const fromPortId = readString(candidate.from.portId, "");
    const toNodeId = readString(candidate.to.nodeId, "");
    const toPortId = readString(candidate.to.portId, "");

    if (!fromNodeId || !fromPortId || !toNodeId || !toPortId) {
      continue;
    }

    if (fromNodeId === toNodeId) {
      continue;
    }

    const fromNode = nodesById.get(fromNodeId);
    const toNode = nodesById.get(toNodeId);
    if (!fromNode || !toNode) {
      continue;
    }

    const fromPort = findPort(nodeSpec(fromNode.kind).outputs, fromPortId);
    const toPort = findPort(nodeSpec(toNode.kind).inputs, toPortId);
    if (!fromPort || !toPort || fromPort.kind !== toPort.kind) {
      continue;
    }

    const connection: NodeConnection = {
      from: {
        nodeId: fromNodeId,
        portId: fromPortId,
      },
      to: {
        nodeId: toNodeId,
        portId: toPortId,
      },
    };

    const targetKey = inputKey(toNodeId, toPortId);
    const dedupeKey = connectionKey(connection);
    if (usedInputs.has(targetKey) || usedConnections.has(dedupeKey)) {
      continue;
    }

    if (hasPathBetween(normalized, toNodeId, fromNodeId)) {
      continue;
    }

    usedInputs.add(targetKey);
    usedConnections.add(dedupeKey);
    normalized.push(connection);
  }

  return normalized;
}

function normalizePersistedNodeKind(
  candidate: Readonly<Record<string, unknown>>
): Readonly<{
  kind: NodeKind;
  config: unknown;
}> | null {
  const rawKind = readString(candidate.kind, "");

  if (isNodeKind(rawKind)) {
    return {
      kind: rawKind,
      config: candidate.config,
    };
  }

  if (rawKind === "path-scale") {
    return {
      kind: "path-transform",
      config: candidate.config,
    };
  }

  if (rawKind.startsWith("program:")) {
    const programId = rawKind.slice("program:".length);
    if (!getEmbeddedProgram(programId)) {
      return null;
    }
    const rawConfig = isRecord(candidate.config) ? candidate.config : {};

    return {
      kind: "program",
      config: {
        programId,
        ...rawConfig,
      },
    };
  }

  return null;
}

function makeRegionBounds(config: NodeConfig): Bounds {
  const centerX = Number(config.centerX ?? contentCenter.x);
  const centerY = Number(config.centerY ?? contentCenter.y);
  const width = Number(config.width ?? contentWidth);
  const height = Number(config.height ?? contentHeight);

  return {
    minX: centerX - width * 0.5,
    maxX: centerX + width * 0.5,
    minY: centerY - height * 0.5,
    maxY: centerY + height * 0.5,
  };
}

function svgMaskFitMode(config: NodeConfig): SvgMaskFitMode {
  return String(config.fitMode ?? "contain") === "stretch" ? "stretch" : "contain";
}

function svgMaskPlacement(config: NodeConfig): SvgMaskPlacement {
  return {
    center: {
      x: Number(config.centerX ?? contentCenter.x),
      y: Number(config.centerY ?? contentCenter.y),
    },
    width: Number(config.width ?? 120),
    height: Number(config.height ?? 120),
    rotationDeg: Number(config.rotationDeg ?? 0),
    fitMode: svgMaskFitMode(config),
  };
}

function svgMaskData(config: NodeConfig) {
  return decodeSvgMaskData(String(config.svgMaskDataBase64 ?? ""));
}

function svgMaskFromConfig(config: NodeConfig): MaskShape | null {
  const data = svgMaskData(config);
  if (!data) {
    return null;
  }

  const placement = svgMaskPlacement(config);
  const guide = svgMaskFramePath(data, placement);

  return makeMask(
    svgMaskFrameBounds(data, placement),
    (point) => pointInSvgMask(point, data, placement),
    [guide]
  );
}

function polygonBounds(polygon: Polygon): Bounds {
  if (polygon.length === 0) {
    return emptyBounds;
  }

  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function polygonToPolyline(polygon: Polygon): Polyline {
  return {
    points: [...polygon],
    closed: true,
  };
}

function makeCirclePolygon(center: Point, radius: number, segments = 72): Polygon {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });
}

function makeRotatedRectPolygon(
  center: Point,
  width: number,
  height: number,
  rotationDeg: number
): Polygon {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const radians = (rotationDeg / 180) * Math.PI;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ] as const;

  return corners.map((corner) => ({
    x: center.x + corner.x * cos - corner.y * sin,
    y: center.y + corner.x * sin + corner.y * cos,
  }));
}

function makeRegularPolygon(
  center: Point,
  radius: number,
  sides: number,
  rotationDeg: number
): Polygon {
  const radians = (rotationDeg / 180) * Math.PI;
  const safeSides = Math.max(3, Math.round(sides));
  return Array.from({ length: safeSides }, (_, index) => {
    const angle = radians + (index / safeSides) * Math.PI * 2;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });
}

function makeCirclePath(centerX: number, centerY: number, radius: number, segments = 48): Polyline {
  return sampleFunctionPath(
    (amount) => {
      const angle = amount * Math.PI * 2;
      return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
    },
    0,
    1,
    segments
  );
}

function reversePath(path: Polyline): Polyline {
  return {
    ...path,
    points: [...path.points].reverse(),
  };
}

function polylineBounds(polyline: Polyline): Bounds | null {
  if (polyline.points.length === 0) {
    return null;
  }

  const xs = polyline.points.map((point) => point.x);
  const ys = polyline.points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function pathSetBounds(paths: readonly Polyline[]): Bounds | null {
  let combinedBounds: Bounds | null = null;

  for (const path of paths) {
    const bounds = polylineBounds(path);
    if (!bounds) {
      continue;
    }

    combinedBounds = combinedBounds ? unionBounds(combinedBounds, bounds) : bounds;
  }

  return combinedBounds;
}

function rotatePoint(point: Point, radians: number): Point {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function transformPolyline(
  polyline: Polyline,
  center: Point,
  transform: Readonly<{
    translateX: number;
    translateY: number;
    scaleX: number;
    scaleY: number;
    rotationDeg: number;
  }>
): Polyline {
  const rotationRadians = (transform.rotationDeg / 180) * Math.PI;

  return {
    ...polyline,
    points: polyline.points.map((point) => {
      const local = {
        x: (point.x - center.x) * transform.scaleX,
        y: (point.y - center.y) * transform.scaleY,
      };
      const rotated = rotatePoint(local, rotationRadians);

      return {
        x: center.x + rotated.x + transform.translateX,
        y: center.y + rotated.y + transform.translateY,
      };
    }),
  };
}

function transformPathsAroundCenter(
  paths: readonly Polyline[],
  transform: Readonly<{
    translateX: number;
    translateY: number;
    scaleX: number;
    scaleY: number;
    rotationDeg: number;
  }>
): readonly Polyline[] {
  const bounds = pathSetBounds(paths);
  if (!bounds) {
    return [];
  }

  const center = boundsCenter(bounds);
  return paths.map((path) => transformPolyline(path, center, transform));
}

function clipPathsToContent(paths: readonly Polyline[]): readonly Polyline[] {
  return paths.flatMap((path) => clipPolylineToBounds(path, content));
}

function clipPathsToPolygon(
  paths: readonly Polyline[],
  polygon: Polygon,
  mode: "clip" | "exclude"
): readonly Polyline[] {
  return paths.flatMap((path) =>
    mode === "clip"
      ? clipPolylineToPolygon(path, polygon)
      : excludePolylineFromPolygon(path, polygon)
  );
}

function interpolatePoint(start: Point, end: Point, amount: number): Point {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  };
}

const THICK_LINE_SPACING_MM = 0.6;

function thickLineOffsets(thickness: number): readonly number[] {
  if (thickness <= THICK_LINE_SPACING_MM * 1.25) {
    return [0];
  }

  const count = Math.max(2, Math.floor(thickness / THICK_LINE_SPACING_MM) + 1);
  const start = -thickness * 0.5;
  const step = count > 1 ? thickness / (count - 1) : 0;

  return Array.from({ length: count }, (_, index) => start + step * index);
}

function lineNodeCenterline(config: NodeConfig): Readonly<{ start: Point; end: Point }> {
  const center = {
    x: Number(config.centerX),
    y: Number(config.centerY),
  };
  const halfLength = Number(config.length) * 0.5;
  const direction = rotatePoint(
    {
      x: halfLength,
      y: 0,
    },
    (Number(config.angleDeg) / 180) * Math.PI
  );

  return {
    start: {
      x: center.x - direction.x,
      y: center.y - direction.y,
    },
    end: {
      x: center.x + direction.x,
      y: center.y + direction.y,
    },
  };
}

function buildLineNodePaths(config: NodeConfig): readonly Polyline[] {
  const { start, end } = lineNodeCenterline(config);
  const length = distanceBetweenPoints(start, end);
  if (length < 1e-6) {
    return [];
  }

  const direction = {
    x: (end.x - start.x) / length,
    y: (end.y - start.y) / length,
  };
  const normal = {
    x: -direction.y,
    y: direction.x,
  };
  const dashLength = Math.max(0.1, Number(config.dashLength));
  const dashGap = Math.max(0.1, Number(config.dashGap));
  const solid = String(config.style) !== "dashed";
  const paths: Polyline[] = [];

  for (const offset of thickLineOffsets(Number(config.thickness))) {
    const offsetVector = {
      x: normal.x * offset,
      y: normal.y * offset,
    };
    const laneStart = {
      x: start.x + offsetVector.x,
      y: start.y + offsetVector.y,
    };
    const laneEnd = {
      x: end.x + offsetVector.x,
      y: end.y + offsetVector.y,
    };

    if (solid) {
      paths.push({
        points: [laneStart, laneEnd],
      });
      continue;
    }

    let cursor = 0;
    while (cursor < length - 1e-6) {
      const dashStart = interpolatePoint(laneStart, laneEnd, cursor / length);
      const dashEnd = interpolatePoint(
        laneStart,
        laneEnd,
        Math.min(1, (cursor + dashLength) / length)
      );
      paths.push({
        points: [dashStart, dashEnd],
      });
      cursor += dashLength + dashGap;
    }
  }

  return paths;
}

function pointInBoundsInclusive(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

function polygonSignedArea(points: readonly Point[]): number {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }

  return area * 0.5;
}

function insetBounds(bounds: Bounds, inset: number): Bounds {
  if (inset <= 0) {
    return bounds;
  }

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (width <= inset * 2 || height <= inset * 2) {
    return bounds;
  }

  return {
    minX: bounds.minX + inset,
    minY: bounds.minY + inset,
    maxX: bounds.maxX - inset,
    maxY: bounds.maxY - inset,
  };
}

function closePolylineLoop(polyline: Polyline): Polyline {
  if (polyline.points.length < 2) {
    return polyline;
  }

  const first = polyline.points[0]!;
  const last = polyline.points.at(-1)!;
  const alreadyClosed = distanceBetweenPoints(first, last) < 1e-6;

  return {
    points: alreadyClosed ? [...polyline.points] : [...polyline.points, first],
  };
}

function closedPolylineNormal(start: Point, end: Point): Point {
  const length = distanceBetweenPoints(start, end) || 1;
  return {
    x: -(end.y - start.y) / length,
    y: (end.x - start.x) / length,
  };
}

function offsetClosedPolyline(polyline: Polyline, offsetMm: number): Polyline {
  if (polyline.points.length < 3) {
    return polyline;
  }

  const count = polyline.points.length;
  const points = polyline.points.map((point, index) => {
    const previous = polyline.points[(index + count - 1) % count]!;
    const next = polyline.points[(index + 1) % count]!;
    const before = closedPolylineNormal(previous, point);
    const after = closedPolylineNormal(point, next);
    const normal = {
      x: before.x + after.x,
      y: before.y + after.y,
    };
    const length = Math.hypot(normal.x, normal.y);
    const safeNormal = length > 1e-6 ? { x: normal.x / length, y: normal.y / length } : before;

    return {
      x: point.x + safeNormal.x * offsetMm,
      y: point.y + safeNormal.y * offsetMm,
    };
  });

  return {
    points,
    closed: true,
  };
}

function makeTextMask(outlines: readonly Polyline[]): MaskShape | null {
  const bounds = pathSetBounds(outlines);
  if (!bounds) {
    return null;
  }

  const contours = outlines.flatMap((path) => {
    if (!path.closed || path.points.length < 3) {
      return [];
    }

    const contourBounds = polylineBounds(path);
    if (!contourBounds) {
      return [];
    }

    return [
      {
        bounds: contourBounds,
        polygon: [...path.points] as Polygon,
      },
    ];
  });

  if (contours.length === 0) {
    return null;
  }

  return makeMask(
    bounds,
    (point) => {
      if (!pointInBoundsInclusive(point, bounds)) {
        return false;
      }

      let hits = 0;
      for (const contour of contours) {
        if (!pointInBoundsInclusive(point, contour.bounds)) {
          continue;
        }

        if (pointInPolygon(point, contour.polygon)) {
          hits += 1;
        }
      }

      return hits % 2 === 1;
    },
    outlines
  );
}

function textInsetDirection(path: Polyline, mask: MaskShape): number {
  const epsilon = 0.35;

  for (let index = 0; index < path.points.length; index += 1) {
    const start = path.points[index]!;
    const end = path.points[(index + 1) % path.points.length]!;
    const length = distanceBetweenPoints(start, end);
    if (length < 1e-6) {
      continue;
    }

    const midpoint = interpolatePoint(start, end, 0.5);
    const tangent = {
      x: (end.x - start.x) / length,
      y: (end.y - start.y) / length,
    };
    const normal = {
      x: -tangent.y,
      y: tangent.x,
    };
    const positive = {
      x: midpoint.x + normal.x * epsilon,
      y: midpoint.y + normal.y * epsilon,
    };
    const negative = {
      x: midpoint.x - normal.x * epsilon,
      y: midpoint.y - normal.y * epsilon,
    };
    const positiveInside = mask.contains(positive);
    const negativeInside = mask.contains(negative);

    if (positiveInside !== negativeInside) {
      return positiveInside ? 1 : -1;
    }
  }

  return polygonSignedArea(path.points) >= 0 ? 1 : -1;
}

function buildTextInsetPaths(
  outlines: readonly Polyline[],
  mask: MaskShape,
  spacing: number
): readonly Polyline[] {
  const maxDimension = Math.max(
    mask.bounds.maxX - mask.bounds.minX,
    mask.bounds.maxY - mask.bounds.minY
  );
  const maxPasses = Math.max(1, Math.min(96, Math.ceil(maxDimension / Math.max(spacing, 0.1))));
  const insetPaths: Polyline[] = [];

  for (const path of outlines) {
    if (!path.closed || path.points.length < 3) {
      continue;
    }

    const direction = textInsetDirection(path, mask);
    let emptyPasses = 0;

    for (let index = 1; index <= maxPasses; index += 1) {
      const offsetPath = closePolylineLoop(offsetClosedPolyline(path, spacing * direction * index));
      const clipped = applyMaskToPaths([offsetPath], mask, "clip");

      if (clipped.length === 0) {
        emptyPasses += 1;
        if (emptyPasses >= 2) {
          break;
        }
        continue;
      }

      emptyPasses = 0;
      insetPaths.push(...clipped);
    }
  }

  return insetPaths;
}

function buildTextCurveFillPaths(
  pattern: string,
  bounds: Bounds,
  rotationDeg: number,
  order: number,
  spacing: number
): readonly Polyline[] {
  const curveBounds = insetBounds(bounds, spacing * 0.25);
  let curve: Polyline | null = null;

  switch (pattern) {
    case "hilbert":
      curve = generateHilbertCurve(clamp(order, 1, 6), curveBounds);
      break;
    case "moore":
      curve = generateMooreCurve(clamp(order, 1, 6), curveBounds);
      break;
    case "peano":
      curve = generatePeanoCurve(clamp(order, 1, 4), curveBounds);
      break;
    case "dragon":
      curve = generateDragonCurve(clamp(order + 4, 2, 16), curveBounds);
      break;
    default:
      return [];
  }

  if (rotationDeg === 0) {
    return [curve];
  }

  return transformPathsAroundCenter([curve], {
    translateX: 0,
    translateY: 0,
    scaleX: 1,
    scaleY: 1,
    rotationDeg,
  });
}

function buildTextFillPaths(
  outlines: readonly Polyline[],
  bounds: Bounds,
  config: NodeConfig
): readonly Polyline[] {
  const pattern = String(config.fillPattern ?? "outline");
  if (pattern === "outline") {
    return [];
  }

  const mask = makeTextMask(outlines);
  if (!mask) {
    return [];
  }

  const spacing = Math.max(0.35, Number(config.fillSpacing ?? 3.6));
  const angleDeg = Number(config.fillAngleDeg ?? 45);
  const curveOrder = Math.round(Number(config.curveOrder ?? 4));

  if (pattern === "inset") {
    return buildTextInsetPaths(outlines, mask, spacing);
  }

  if (pattern === "hatch" || pattern === "cross-hatch") {
    const hatchPaths = [
      ...hatchBounds(bounds, spacing, angleDeg),
      ...(pattern === "cross-hatch" ? hatchBounds(bounds, spacing, angleDeg + 90) : []),
    ];

    return applyMaskToPaths(hatchPaths, mask, "clip");
  }

  return applyMaskToPaths(
    buildTextCurveFillPaths(pattern, bounds, angleDeg, curveOrder, spacing),
    mask,
    "clip"
  );
}

function buildTextNodePaths(config: NodeConfig): readonly Polyline[] {
  const textResult = generateTextPaths({
    center: {
      x: Number(config.centerX),
      y: Number(config.centerY),
    },
    text: String(config.text ?? ""),
    fontId: String(config.fontId ?? "inter"),
    fontSize: Number(config.fontSize),
    fontWeight: Number(config.fontWeight),
    rotationDeg: Number(config.rotationDeg ?? 0),
    fontDataBase64: String(config.fontDataBase64 ?? ""),
    fontCacheKey: String(config.fontCacheKey ?? ""),
  });
  const outlines = textResult.paths;
  const bounds = textResult.bounds;
  if (!bounds || outlines.length === 0) {
    return [];
  }

  const pattern = String(config.fillPattern ?? "outline");
  if (pattern === "outline") {
    return outlines;
  }

  const fillPaths = buildTextFillPaths(outlines, bounds, config);
  if (!Boolean(config.includeOutline ?? true)) {
    return fillPaths;
  }

  return [...fillPaths, ...outlines];
}

function clipPolylineToMaskSampling(
  polyline: Polyline,
  mask: MaskShape,
  mode: "clip" | "exclude"
): readonly Polyline[] {
  if (polyline.points.length < 2) {
    return [];
  }

  const result: Polyline[] = [];
  let currentPoints: Point[] = [];

  const flush = () => {
    if (currentPoints.length > 1) {
      result.push({ points: currentPoints });
    }
    currentPoints = [];
  };

  for (let index = 1; index < polyline.points.length; index += 1) {
    const start = polyline.points[index - 1]!;
    const end = polyline.points[index]!;
    const length = distanceBetweenPoints(start, end);
    const steps = Math.max(1, Math.ceil(length / MASK_SAMPLE_STEP_MM));

    for (let step = 1; step <= steps; step += 1) {
      const pieceStart = interpolatePoint(start, end, (step - 1) / steps);
      const pieceEnd = interpolatePoint(start, end, step / steps);
      const midpoint = interpolatePoint(start, end, (step - 0.5) / steps);
      const keep = mode === "clip" ? mask.contains(midpoint) : !mask.contains(midpoint);

      if (!keep) {
        flush();
        continue;
      }

      if (
        currentPoints.length === 0 ||
        distanceBetweenPoints(currentPoints.at(-1)!, pieceStart) > 1e-6
      ) {
        currentPoints.push(pieceStart);
      }

      currentPoints.push(pieceEnd);
    }
  }

  flush();
  return result;
}

function applyMaskToPaths(
  paths: readonly Polyline[],
  mask: MaskShape,
  mode: "clip" | "exclude"
): readonly Polyline[] {
  if (mask.polygon) {
    return clipPathsToPolygon(paths, mask.polygon, mode);
  }

  return paths.flatMap((path) => clipPolylineToMaskSampling(path, mask, mode));
}

function unionBounds(left: Bounds, right: Bounds): Bounds {
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
}

function intersectBounds(left: Bounds, right: Bounds): Bounds | null {
  const intersection = {
    minX: Math.max(left.minX, right.minX),
    minY: Math.max(left.minY, right.minY),
    maxX: Math.min(left.maxX, right.maxX),
    maxY: Math.min(left.maxY, right.maxY),
  };

  return intersection.minX <= intersection.maxX && intersection.minY <= intersection.maxY
    ? intersection
    : null;
}

function makeMask(
  bounds: Bounds,
  contains: (point: Point) => boolean,
  outlines: readonly Polyline[],
  polygon?: Polygon
): MaskShape {
  return {
    bounds,
    contains,
    outlines,
    polygon,
  };
}

function combineMasks(
  operation: string,
  left: MaskShape | null,
  right: MaskShape | null
): MaskShape | null {
  if (!left && !right) {
    return null;
  }

  if (!left) {
    return operation === "intersection" || operation === "subtract" ? null : right;
  }

  if (!right) {
    return left;
  }

  const outlines = [...left.outlines, ...right.outlines];

  if (operation === "intersection") {
    const bounds = intersectBounds(left.bounds, right.bounds) ?? emptyBounds;
    return makeMask(
      bounds,
      (point) => left.contains(point) && right.contains(point),
      outlines
    );
  }

  if (operation === "subtract") {
    return makeMask(
      left.bounds,
      (point) => left.contains(point) && !right.contains(point),
      outlines
    );
  }

  if (operation === "xor") {
    return makeMask(
      unionBounds(left.bounds, right.bounds),
      (point) => left.contains(point) !== right.contains(point),
      outlines
    );
  }

  return makeMask(
    unionBounds(left.bounds, right.bounds),
    (point) => left.contains(point) || right.contains(point),
    outlines
  );
}

function randomPoint(bounds: Bounds, rng: ReturnType<typeof createRng>): Point {
  return {
    x: rng.float(bounds.minX, bounds.maxX),
    y: rng.float(bounds.minY, bounds.maxY),
  };
}

function collectFieldPaths(
  count: number,
  seed: number,
  bounds: Bounds,
  options: Readonly<{
    columns: number;
    rows: number;
    segmentLength: number;
    steps: number;
    frequency: number;
    continuousCurves: boolean;
  }>
): readonly Polyline[] {
  const field = createPerlinVectorField(bounds, {
    columns: options.columns,
    rows: options.rows,
    seed,
    frequency: options.frequency,
    octaves: 3,
    length: 8.75,
  });
  const rng = createRng(seed);
  const paths: Polyline[] = [];

  for (let index = 0; index < count; index += 1) {
    const path = options.continuousCurves
      ? traceContinuousVectorField(field, randomPoint(bounds, rng), {
          segmentLength: options.segmentLength,
          steps: options.steps,
          bounds,
        })
      : traceNearestVectorField(field, randomPoint(bounds, rng), {
          segmentLength: options.segmentLength,
          steps: options.steps,
          bounds,
        });

    if (path.points.length < 2) {
      continue;
    }

    paths.push(index % 2 === 0 ? path : reversePath(path));
  }

  return paths;
}

function maxDistanceFromOrigin(polyline: Polyline): number {
  let maxDistance = 0;

  for (const point of polyline.points) {
    maxDistance = Math.max(maxDistance, Math.hypot(point.x, point.y));
  }

  return Math.max(1e-6, maxDistance);
}

function placePolyline(polyline: Polyline, center: Point, radius: number): Polyline {
  const scale = radius / maxDistanceFromOrigin(polyline);

  return {
    points: polyline.points.map((point) => ({
      x: center.x + point.x * scale,
      y: center.y + point.y * scale,
    })),
  };
}

function styleToStroke(style: string): string {
  switch (style) {
    case "accent":
      return plotPalette.accent;
    case "mask":
      return plotPalette.mask;
    case "water":
      return plotPalette.water;
    default:
      return plotPalette.primary;
  }
}

function boundsCenter(bounds: Bounds): Point {
  return {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };
}

function fitPathsIntoBounds(
  paths: readonly Polyline[],
  sourceBounds: Bounds,
  targetBounds: Bounds
): readonly Polyline[] {
  const sourceWidth = Math.max(1e-6, sourceBounds.maxX - sourceBounds.minX);
  const sourceHeight = Math.max(1e-6, sourceBounds.maxY - sourceBounds.minY);
  const targetWidth = Math.max(1e-6, targetBounds.maxX - targetBounds.minX);
  const targetHeight = Math.max(1e-6, targetBounds.maxY - targetBounds.minY);
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const sourceCenter = boundsCenter(sourceBounds);
  const targetCenter = boundsCenter(targetBounds);

  return paths.map((path) => ({
    ...path,
    points: path.points.map((point) => ({
      x: targetCenter.x + (point.x - sourceCenter.x) * scale,
      y: targetCenter.y + (point.y - sourceCenter.y) * scale,
    })),
  }));
}

function programNodeParams(
  program: EmbeddedProgram,
  config: NodeConfig,
  paramSet: EmbeddedProgramParamSet | null
): Readonly<Record<string, number | boolean>> {
  return Object.fromEntries(
    Object.keys(program.params).map((key) => [
      key,
      config[key] ?? paramSet?.params[key] ?? fieldDefaultValue(fieldForProgramParam(key, program.params[key]!)),
    ])
  ) as Readonly<Record<string, number | boolean>>;
}

function renderProgramNodePaths(
  config: NodeConfig,
  mode: EvaluationContext["mode"]
): readonly Polyline[] {
  const program = programNodeProgram(config);
  if (!program) {
    return [];
  }

  const params = programNodeParams(program, config, programNodeParamSet(config));
  const programState = programNodeResolvedProgramState(config);
  const document = program.render({
    programId: program.id,
    mode,
    showDebug: false,
    params: params as never,
    programState,
  });

  return clipPathsToContent(
    fitPathsIntoBounds(
      document.layers.flatMap((layer) => layer.paths),
      contentBounds(program.canvas),
      content
    )
  );
}

function resolveNodeInput(
  node: ComposerNode,
  portId: string,
  kind: NodePortKind,
  context: EvaluationContext,
  evaluateNode: (nodeId: string) => RuntimeOutputs
): RuntimeValue | null {
  const connection = context.incomingByInputKey.get(inputKey(node.id, portId));
  if (!connection) {
    return null;
  }

  const outputs = evaluateNode(connection.from.nodeId);
  const value = outputs[connection.from.portId];
  return value?.kind === kind ? value : null;
}

function evaluateNodeOutputs(
  node: ComposerNode,
  context: EvaluationContext,
  evaluateNode: (nodeId: string) => RuntimeOutputs
): RuntimeOutputs {
  if (node.kind === "program") {
    return {
      paths: {
        kind: "paths",
        paths: renderProgramNodePaths(node.config, context.mode),
      },
    };
  }

  if (node.kind === "line-grid") {
    const bounds = makeRegionBounds(node.config);
    return {
      paths: {
        kind: "paths",
        paths: clipPathsToContent(hatchBounds(bounds, Number(node.config.spacing), Number(node.config.angleDeg))),
      },
    };
  }

  if (node.kind === "line") {
    return {
      paths: {
        kind: "paths",
        paths: clipPathsToContent(buildLineNodePaths(node.config)),
      },
    };
  }

  if (node.kind === "perlin-field") {
    const bounds = makeRegionBounds(node.config);
    return {
      paths: {
        kind: "paths",
        paths: clipPathsToContent(
          collectFieldPaths(Number(node.config.paths), Number(node.config.seed), bounds, {
            columns: Number(node.config.columns),
            rows: Number(node.config.rows),
            segmentLength: Number(node.config.segmentLength),
            steps: Number(node.config.steps),
            frequency: Number(node.config.frequency),
            continuousCurves: Boolean(node.config.continuousCurves),
          })
        ),
      },
    };
  }

  if (node.kind === "circle-grid") {
    const bounds = makeRegionBounds(node.config);
    const columns = Math.max(1, Number(node.config.columns));
    const rows = Math.max(1, Number(node.config.rows));
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const dx = width / columns;
    const dy = height / rows;
    const paths: Polyline[] = [];

    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        paths.push(
          makeCirclePath(
            bounds.minX + (column + 0.5) * dx,
            bounds.minY + (row + 0.5) * dy,
            Number(node.config.radius),
            Number(node.config.segments)
          )
        );
      }
    }

    return {
      paths: {
        kind: "paths",
        paths: clipPathsToContent(paths),
      },
    };
  }

  if (node.kind === "image-circles") {
    const bounds = makeRegionBounds(node.config);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const columns = Math.max(1, Number(node.config.columns));
    const rows = Math.max(1, Number(node.config.rows));
    const dx = width / columns;
    const dy = height / rows;
    const paths: Polyline[] = [];

    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const centerX = bounds.minX + (column + 0.5) * dx;
        const centerY = bounds.minY + (row + 0.5) * dy;
        const sample = sampleGrayscaleImageGrid(goPenSampleGrid, { x: centerX, y: centerY }, bounds);
        if (!sample) {
          continue;
        }

        const darkness = 1 - sample.luminosity;
        if (darkness < 0.05) {
          continue;
        }

        const radius = Math.max(0.25, darkness * Number(node.config.maxRadius));
        paths.push(makeCirclePath(centerX, centerY, radius));

        const minSpacing = Number(node.config.minHatchSpacing);
        const maxSpacing = Number(node.config.maxHatchSpacing);
        const hatchSpacing = maxSpacing - darkness * (maxSpacing - minSpacing);
        const inverseSqrtTwo = 1 / Math.sqrt(2);

        for (let offset = -radius + hatchSpacing; offset < radius; offset += hatchSpacing) {
          const halfChordSquared = radius * radius - offset * offset;
          if (halfChordSquared <= 0) {
            continue;
          }

          const halfChord = Math.sqrt(halfChordSquared);
          const perpendicularX = offset * inverseSqrtTwo;
          const perpendicularY = -offset * inverseSqrtTwo;

          paths.push({
            points: [
              {
                x: centerX + perpendicularX - halfChord * inverseSqrtTwo,
                y: centerY + perpendicularY - halfChord * inverseSqrtTwo,
              },
              {
                x: centerX + perpendicularX + halfChord * inverseSqrtTwo,
                y: centerY + perpendicularY + halfChord * inverseSqrtTwo,
              },
            ],
          });
        }
      }
    }

    return {
      paths: {
        kind: "paths",
        paths: clipPathsToContent(paths),
      },
    };
  }

  if (node.kind === "text") {
    return {
      paths: {
        kind: "paths",
        paths: buildTextNodePaths(node.config),
      },
    };
  }

  if (node.kind === "hamilton-path") {
    const domainValue = resolveNodeInput(node, "domain", "mask", context, evaluateNode);
    const domainMask = domainValue?.kind === "mask" ? domainValue.mask : null;
    const bounds = domainMask ? domainMask.bounds : makeRegionBounds(node.config);
    const result = generateHamiltonPaths(bounds, {
      rows: Number(node.config.rows),
      cols: Number(node.config.columns),
      seed: Number(node.config.seed),
      gridRotationDeg: Number(node.config.gridRotationDeg ?? 0),
      latticeAngleDeg: Number(node.config.latticeAngleDeg ?? 90),
      rowStepRatio: Number(node.config.rowStepRatio ?? 1),
      strokeCount: Number(node.config.strokeCount),
      strokeSpacing: Number(node.config.strokeSpacing),
      cornerRadius: Number(node.config.cornerRadius),
      deflection: Number(node.config.deflection),
      drawCenterlines: Boolean(node.config.drawCenterlines),
    });

    return {
      paths: {
        kind: "paths",
        paths: clipPathsToContent(
          domainMask ? applyMaskToPaths(result.paths, domainMask, "clip") : result.paths
        ),
      },
    };
  }

  if (node.kind === "voronoi-nested-cells") {
    const bounds = makeRegionBounds(node.config);
    const result = generateVoronoiNestedCells(bounds, {
      pointCount: Number(node.config.pointCount),
      seed: Number(node.config.randomSeed),
      filletRadius: Number(node.config.filletRadius),
      layerCount: Number(node.config.layerCount),
      scaleBase: Number(node.config.scaleBase),
      rotationStep: Number(node.config.rotationStep),
    });

    return {
      paths: {
        kind: "paths",
        paths: result.paths,
      },
    };
  }

  if (node.kind === "terrain-slice") {
    const geometry = generateTerrainSliceGeometry({
      center: {
        x: Number(node.config.centerX),
        y: Number(node.config.centerY),
      },
      seed: Number(node.config.seed),
      planeWidth: Number(node.config.width),
      planeDepth: Number(node.config.height),
      terrainOffsetX: Number(node.config.terrainOffsetX),
      terrainOffsetY: Number(node.config.terrainOffsetY),
      mountainScale: Number(node.config.mountainScale),
      height: Number(node.config.relief),
      waterLevel: Number(node.config.waterLevel),
      contourLevels: Number(node.config.contourLevels),
      hatchSpacing: Number(node.config.hatchSpacing),
      roughness: Number(node.config.roughness),
      waterSpacing: Number(node.config.waterSpacing),
    });

    return {
      terrain: {
        kind: "paths",
        paths: clipPathsToContent(geometry.aboveWaterTerrainPaths),
      },
      water: {
        kind: "paths",
        paths: clipPathsToContent(geometry.waterPaths),
      },
    };
  }

  if (node.kind === "trochoid") {
    const rollingRadius = Boolean(node.config.useEpitrochoid)
      ? Number(node.config.rollingRadius)
      : clamp(Number(node.config.rollingRadius), 1, Math.max(1, Number(node.config.fixedRadius) - 1));
    const template = Boolean(node.config.useEpitrochoid)
      ? sampleEpitrochoid({
          fixedRadius: Number(node.config.fixedRadius),
          rollingRadius,
          pointOffset: rollingRadius * Number(node.config.pointOffsetRatio),
          rotation: (Number(node.config.rotationDeg) / 180) * Math.PI,
          samplesPerTurn: Number(node.config.samplesPerTurn),
        })
      : sampleHypotrochoid({
          fixedRadius: Number(node.config.fixedRadius),
          rollingRadius,
          pointOffset: rollingRadius * Number(node.config.pointOffsetRatio),
          rotation: (Number(node.config.rotationDeg) / 180) * Math.PI,
          samplesPerTurn: Number(node.config.samplesPerTurn),
        });

    return {
      paths: {
        kind: "paths",
        paths: clipPathsToContent([
          placePolyline(
            template,
            {
              x: Number(node.config.centerX),
              y: Number(node.config.centerY),
            },
            Number(node.config.figureRadius)
          ),
        ]),
      },
    };
  }

  if (node.kind === "mask-circle") {
    const centerPoint = {
      x: Number(node.config.centerX),
      y: Number(node.config.centerY),
    };
    const radius = Number(node.config.radius);
    const polygon = makeCirclePolygon(centerPoint, radius, 96);

    return {
      mask: {
        kind: "mask",
        mask: makeMask(
          polygonBounds(polygon),
          (point) => Math.hypot(point.x - centerPoint.x, point.y - centerPoint.y) <= radius,
          [polygonToPolyline(polygon)],
          polygon
        ),
      },
    };
  }

  if (node.kind === "mask-rect") {
    const polygon = makeRotatedRectPolygon(
      {
        x: Number(node.config.centerX),
        y: Number(node.config.centerY),
      },
      Number(node.config.width),
      Number(node.config.height),
      Number(node.config.rotationDeg)
    );

    return {
      mask: {
        kind: "mask",
        mask: makeMask(
          polygonBounds(polygon),
          (point) => pointInPolygon(point, polygon),
          [polygonToPolyline(polygon)],
          polygon
        ),
      },
    };
  }

  if (node.kind === "mask-polygon") {
    const polygon = makeRegularPolygon(
      {
        x: Number(node.config.centerX),
        y: Number(node.config.centerY),
      },
      Number(node.config.radius),
      Number(node.config.sides),
      Number(node.config.rotationDeg)
    );

    return {
      mask: {
        kind: "mask",
        mask: makeMask(
          polygonBounds(polygon),
          (point) => pointInPolygon(point, polygon),
          [polygonToPolyline(polygon)],
          polygon
        ),
      },
    };
  }

  if (node.kind === "mask-svg") {
    const mask = svgMaskFromConfig(node.config);
    return mask
      ? {
          mask: {
            kind: "mask",
            mask,
          },
        }
      : {};
  }

  if (node.kind === "mask-boolean") {
    const left = resolveNodeInput(node, "a", "mask", context, evaluateNode);
    const right = resolveNodeInput(node, "b", "mask", context, evaluateNode);
    const mask = combineMasks(
      String(node.config.operation ?? "union"),
      left?.kind === "mask" ? left.mask : null,
      right?.kind === "mask" ? right.mask : null
    );

    return mask
      ? {
          mask: {
            kind: "mask",
            mask,
          },
        }
      : {};
  }

  if (node.kind === "clip-mask") {
    const pathsValue = resolveNodeInput(node, "paths", "paths", context, evaluateNode);
    const maskValue = resolveNodeInput(node, "mask", "mask", context, evaluateNode);
    const paths = pathsValue?.kind === "paths" ? pathsValue.paths : [];
    const mode = String(node.config.mode ?? "clip") === "exclude" ? "exclude" : "clip";

    return {
      paths: {
        kind: "paths",
        paths: maskValue?.kind === "mask" ? applyMaskToPaths(paths, maskValue.mask, mode) : paths,
      },
    };
  }

  if (node.kind === "path-transform") {
    const input = resolveNodeInput(node, "paths", "paths", context, evaluateNode);
    const paths = input?.kind === "paths" ? input.paths : [];

    return {
      paths: {
        kind: "paths",
        paths: clipPathsToContent(
          transformPathsAroundCenter(paths, {
            translateX: Number(node.config.translateX ?? 0),
            translateY: Number(node.config.translateY ?? 0),
            scaleX: Number(node.config.scaleX ?? 1),
            scaleY: Number(node.config.scaleY ?? 1),
            rotationDeg: Number(node.config.rotationDeg ?? 0),
          })
        ),
      },
    };
  }

  if (node.kind === "merge-paths") {
    const left = resolveNodeInput(node, "a", "paths", context, evaluateNode);
    const right = resolveNodeInput(node, "b", "paths", context, evaluateNode);

    return {
      paths: {
        kind: "paths",
        paths: [
          ...(left?.kind === "paths" ? left.paths : []),
          ...(right?.kind === "paths" ? right.paths : []),
        ],
      },
    };
  }

  return {};
}

function createDemoState(): NodeComposerProgramState {
  const nodes = [
    createNode("line-grid", 1, { x: 36, y: 112 }, {
      spacing: 7.5,
      angleDeg: 30,
      width: 164,
      height: 222,
    }),
    createNode("mask-circle", 2, { x: 330, y: 42 }, {
      centerX: 82,
      centerY: 176,
      radius: 62,
    }),
    createNode("mask-polygon", 3, { x: 330, y: 202 }, {
      centerX: 136,
      centerY: 124,
      radius: 48,
      sides: 6,
      rotationDeg: 12,
    }),
    createNode("mask-boolean", 4, { x: 598, y: 122 }, {
      operation: "union",
    }),
    createNode("clip-mask", 5, { x: 842, y: 122 }),
    createNode("output-layer", 6, { x: 1102, y: 122 }, {
      label: "Masked Grid",
      style: "primary",
    }),
    createNode("perlin-field", 7, { x: 36, y: 372 }, {
      centerX: 152,
      centerY: 80,
      width: 86,
      height: 86,
      paths: 140,
      seed: 9051,
      frequency: 2.85,
    }),
    createNode("output-layer", 8, { x: 1102, y: 372 }, {
      label: "Perlin Field",
      style: "accent",
    }),
    createNode("trochoid", 9, { x: 598, y: 372 }, {
      centerX: 94,
      centerY: 84,
      figureRadius: 34,
      fixedRadius: 72,
      rollingRadius: 18,
      pointOffsetRatio: 1.15,
      rotationDeg: 18,
      useEpitrochoid: true,
      samplesPerTurn: 220,
    }),
    createNode("output-layer", 10, { x: 1102, y: 522 }, {
      label: "Trochoid",
      style: "mask",
    }),
  ] as const;

  return {
    nodes,
    connections: [
      {
        from: { nodeId: "node-1", portId: "paths" },
        to: { nodeId: "node-5", portId: "paths" },
      },
      {
        from: { nodeId: "node-2", portId: "mask" },
        to: { nodeId: "node-4", portId: "a" },
      },
      {
        from: { nodeId: "node-3", portId: "mask" },
        to: { nodeId: "node-4", portId: "b" },
      },
      {
        from: { nodeId: "node-4", portId: "mask" },
        to: { nodeId: "node-5", portId: "mask" },
      },
      {
        from: { nodeId: "node-5", portId: "paths" },
        to: { nodeId: "node-6", portId: "paths" },
      },
      {
        from: { nodeId: "node-7", portId: "paths" },
        to: { nodeId: "node-8", portId: "paths" },
      },
      {
        from: { nodeId: "node-9", portId: "paths" },
        to: { nodeId: "node-10", portId: "paths" },
      },
    ],
    selectedNodeId: "node-1",
    nextNodeNumber: 11,
  };
}

export function defaultNodeComposerProgramState(): NodeComposerProgramState {
  return createDemoState();
}

export function normalizeNodeComposerProgramState(input: unknown): NodeComposerProgramState {
  const fallback = createDemoState();
  if (!isRecord(input)) {
    return fallback;
  }

  const usedIds = new Set<string>();
  const nodeCandidates = Array.isArray(input.nodes) ? input.nodes : fallback.nodes;
  const nodes = nodeCandidates.flatMap((candidate, index) => {
    if (!isRecord(candidate)) {
      return [];
    }

    const normalizedKind = normalizePersistedNodeKind(candidate);
    if (!normalizedKind) {
      return [];
    }

    const fallbackNode = fallback.nodes[index % fallback.nodes.length]!;
    return [
      {
        id: normalizeNodeId(candidate.id, index + 1, usedIds),
        kind: normalizedKind.kind,
        position: normalizePoint(candidate.position, fallbackNode.position),
        config: normalizeConfigForSpec(normalizedKind.kind, normalizedKind.config),
      } satisfies ComposerNode,
    ];
  });

  const safeNodes = nodes.length > 0 ? nodes : fallback.nodes;
  const safeConnections = normalizeConnections(input.connections, safeNodes);
  const selectedNodeId =
    typeof input.selectedNodeId === "string" && nodeExists(safeNodes, input.selectedNodeId)
      ? input.selectedNodeId
      : safeNodes[0]?.id ?? null;
  const nextNodeNumber =
    typeof input.nextNodeNumber === "number" && Number.isFinite(input.nextNodeNumber)
      ? Math.max(Math.floor(input.nextNodeNumber), deriveNextNodeNumber(safeNodes))
      : deriveNextNodeNumber(safeNodes);

  return {
    nodes: safeNodes,
    connections: safeConnections,
    selectedNodeId,
    nextNodeNumber,
  };
}

export function findNode(
  programState: NodeComposerProgramState,
  nodeId: string | null
): ComposerNode | null {
  if (!nodeId) {
    return null;
  }

  return programState.nodes.find((node) => node.id === nodeId) ?? null;
}

export function selectedNode(programState: NodeComposerProgramState): ComposerNode | null {
  return findNode(programState, programState.selectedNodeId) ?? programState.nodes[0] ?? null;
}

export function selectNodeComposerRenderState(
  programState: unknown
): Readonly<{
  nodes: readonly Readonly<{
    id: string;
    kind: NodeKind;
    config: NodeConfig;
  }>[];
  connections: readonly NodeConnection[];
}> {
  const normalized = normalizeNodeComposerProgramState(programState);

  return {
    nodes: normalized.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      config: node.config,
    })),
    connections: normalized.connections,
  };
}

export function addNode(
  programState: NodeComposerProgramState,
  kind: NodeKind
): NodeComposerProgramState {
  const spec = nodeSpec(kind);
  const categoryIndex = nodeCategories.findIndex(
    (category) => category.id === spec.category
  );
  const categoryNodes = programState.nodes.filter(
    (node) => nodeSpec(node.kind).category === spec.category
  );
  const selected = selectedNode(programState);
  const position = selected
    ? {
        x: clamp(selected.position.x + 36, graphBounds.minX, graphBounds.maxX),
        y: clamp(selected.position.y + 132, graphBounds.minY, graphBounds.maxY),
      }
    : {
        x: 36 + Math.max(0, categoryIndex) * 250,
        y: 42 + categoryNodes.length * 132,
      };
  const nextNode = createNode(kind, programState.nextNodeNumber, position);

  return {
    ...programState,
    nodes: [...programState.nodes, nextNode],
    selectedNodeId: nextNode.id,
    nextNodeNumber: programState.nextNodeNumber + 1,
  };
}

export function removeNode(
  programState: NodeComposerProgramState,
  nodeId: string
): NodeComposerProgramState {
  const nodes = programState.nodes.filter((node) => node.id !== nodeId);
  const connections = programState.connections.filter(
    (connection) =>
      connection.from.nodeId !== nodeId && connection.to.nodeId !== nodeId
  );
  const selectedNodeId =
    programState.selectedNodeId === nodeId
      ? nodes.at(-1)?.id ?? null
      : programState.selectedNodeId !== null &&
          nodeExists(nodes, programState.selectedNodeId)
        ? programState.selectedNodeId
        : nodes[0]?.id ?? null;

  return {
    ...programState,
    nodes,
    connections,
    selectedNodeId,
  };
}

export function moveNode(
  programState: NodeComposerProgramState,
  nodeId: string,
  position: Point
): NodeComposerProgramState {
  return {
    ...programState,
    nodes: programState.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            position: normalizePoint(position, node.position),
          }
        : node
    ),
  };
}

export function selectComposerNode(
  programState: NodeComposerProgramState,
  nodeId: string
): NodeComposerProgramState {
  if (!nodeExists(programState.nodes, nodeId)) {
    return programState;
  }

  return {
    ...programState,
    selectedNodeId: nodeId,
  };
}

export function patchNodeConfig(
  programState: NodeComposerProgramState,
  nodeId: string,
  patch: Readonly<Record<string, NodeConfigValue>>
): NodeComposerProgramState {
  return {
    ...programState,
    nodes: programState.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            config: normalizeConfigForSpec(node.kind, {
              ...node.config,
              ...patch,
            }),
          }
        : node
    ),
  };
}

function replaceNodeConfig(
  programState: NodeComposerProgramState,
  nodeId: string,
  nextConfig: unknown
): NodeComposerProgramState {
  return {
    ...programState,
    nodes: programState.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            config: normalizeConfigForSpec(node.kind, nextConfig),
          }
        : node
    ),
  };
}

export function selectProgramNodeProgram(
  programState: NodeComposerProgramState,
  nodeId: string,
  programId: string
): NodeComposerProgramState {
  const node = findNode(programState, nodeId);
  if (!node || node.kind !== "program") {
    return programState;
  }

  return replaceNodeConfig(programState, nodeId, {
    programId,
    paramSetId: "",
  });
}

export function applyProgramNodeParamSet(
  programState: NodeComposerProgramState,
  nodeId: string,
  paramSetId: string
): NodeComposerProgramState {
  const node = findNode(programState, nodeId);
  if (!node || node.kind !== "program") {
    return programState;
  }

  const programId = programNodeProgramId(node.config);
  const program = getEmbeddedProgram(programId);
  if (!program) {
    return programState;
  }

  const currentParams = Object.fromEntries(
    Object.keys(program.params).map((key) => [key, node.config[key]])
  );
  const paramSet = getEmbeddedProgramParamSet(programId, paramSetId);

  return replaceNodeConfig(programState, nodeId, {
    programId,
    paramSetId: paramSet?.slug ?? "",
    ...(paramSet?.params ?? currentParams),
    [programNodeProgramStateFieldKey]: "",
  });
}

export function moveNodeAnchor(
  programState: NodeComposerProgramState,
  nodeId: string,
  point: Point
): NodeComposerProgramState {
  const node = findNode(programState, nodeId);
  if (!node || !("centerX" in node.config) || !("centerY" in node.config)) {
    return programState;
  }

  return patchNodeConfig(programState, nodeId, {
    centerX: clamp(point.x, content.minX, content.maxX),
    centerY: clamp(point.y, content.minY, content.maxY),
  });
}

export function disconnectInput(
  programState: NodeComposerProgramState,
  nodeId: string,
  portId: string
): NodeComposerProgramState {
  return {
    ...programState,
    connections: programState.connections.filter(
      (connection) =>
        connection.to.nodeId !== nodeId || connection.to.portId !== portId
    ),
  };
}

export function disconnectConnection(
  programState: NodeComposerProgramState,
  connectionToRemove: NodeConnection
): NodeComposerProgramState {
  return {
    ...programState,
    connections: programState.connections.filter(
      (connection) => connectionKey(connection) !== connectionKey(connectionToRemove)
    ),
  };
}

export function connectionId(connection: NodeConnection): string {
  return connectionKey(connection);
}

export function canConnectNodes(
  programState: NodeComposerProgramState,
  connection: NodeConnection
): boolean {
  const fromNode = findNode(programState, connection.from.nodeId);
  const toNode = findNode(programState, connection.to.nodeId);
  if (!fromNode || !toNode || fromNode.id === toNode.id) {
    return false;
  }

  const fromPort = findPort(nodeSpec(fromNode.kind).outputs, connection.from.portId);
  const toPort = findPort(nodeSpec(toNode.kind).inputs, connection.to.portId);
  if (!fromPort || !toPort || fromPort.kind !== toPort.kind) {
    return false;
  }

  const sanitizedConnections = programState.connections.filter(
    (existing) =>
      existing.to.nodeId !== connection.to.nodeId ||
      existing.to.portId !== connection.to.portId
  );

  return !hasPathBetween(sanitizedConnections, connection.to.nodeId, connection.from.nodeId);
}

export function connectNodes(
  programState: NodeComposerProgramState,
  connection: NodeConnection
): NodeComposerProgramState {
  if (!canConnectNodes(programState, connection)) {
    return programState;
  }

  const normalizedConnection = {
    from: {
      nodeId: connection.from.nodeId,
      portId: connection.from.portId,
    },
    to: {
      nodeId: connection.to.nodeId,
      portId: connection.to.portId,
    },
  } satisfies NodeConnection;
  const sanitizedConnections = programState.connections.filter(
    (existing) =>
      existing.to.nodeId !== connection.to.nodeId ||
      existing.to.portId !== connection.to.portId
  );

  return {
    ...programState,
    connections: [...sanitizedConnections, normalizedConnection],
  };
}

export function connectionForInput(
  programState: NodeComposerProgramState,
  nodeId: string,
  portId: string
): NodeConnection | null {
  return getIncomingConnection(programState.connections, nodeId, portId);
}

export function nodeLabel(
  programState: NodeComposerProgramState,
  nodeId: string
): string {
  const node = findNode(programState, nodeId);
  if (!node) {
    return "Unknown";
  }

  if (node.kind === "output-layer") {
    return String(node.config.label ?? displayNameForKind(node.kind));
  }

  if (node.kind === "program") {
    const index =
      programState.nodes.findIndex((candidate) => candidate.id === node.id) + 1;
    return `${programNodeProgram(node.config)?.title ?? "Program"} ${index}`;
  }

  const index =
    programState.nodes.findIndex((candidate) => candidate.id === node.id) + 1;
  return `${displayNameForKind(node.kind)} ${index}`;
}

export function nodeKindLabel(node: ComposerNode): string {
  if (node.kind === "program") {
    return "Program";
  }

  return nodeSpec(node.kind).title;
}

export function guidePathsForNode(node: ComposerNode): readonly Polyline[] {
  if (node.kind === "program") {
    return [];
  }

  if (node.kind === "line") {
    return buildLineNodePaths(node.config);
  }

  if (node.kind === "text") {
    return buildTextNodePaths(node.config);
  }

  if (
    node.kind === "line-grid" ||
    node.kind === "perlin-field" ||
    node.kind === "circle-grid" ||
    node.kind === "image-circles"
  ) {
    const bounds = makeRegionBounds(node.config);
    return [
      {
        points: [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
          { x: bounds.minX, y: bounds.maxY },
        ],
        closed: true,
      },
    ];
  }

  if (node.kind === "hamilton-path") {
    const bounds = makeRegionBounds(node.config);
    const rowStepRatio = Number(node.config.rowStepRatio ?? 1);
    const guide = generateHamiltonPaths(bounds, {
      rows: Number(node.config.rows),
      cols: Number(node.config.columns),
      seed: 1,
      gridRotationDeg: Number(node.config.gridRotationDeg ?? 0),
      latticeAngleDeg: Number(node.config.latticeAngleDeg ?? 90),
      rowStepRatio,
      mixSteps: 0,
    });
    const debugRadius = Math.max(
      0.35,
      Math.min(guide.cellSize * Math.min(1, rowStepRatio) * 0.18, 1.6)
    );

    return [
      {
        points: [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
          { x: bounds.minX, y: bounds.maxY },
        ],
        closed: true,
      },
      ...guide.baseNodes.map((point) => makeCirclePath(point.x, point.y, debugRadius, 24)),
    ];
  }

  if (node.kind === "voronoi-nested-cells") {
    const bounds = makeRegionBounds(node.config);
    const result = generateVoronoiNestedCells(bounds, {
      pointCount: Number(node.config.pointCount),
      seed: Number(node.config.randomSeed),
      filletRadius: Number(node.config.filletRadius),
      layerCount: 1,
      scaleBase: 1,
      rotationStep: 0,
    });
    const averageCellSpan = Math.sqrt(
      (Number(node.config.width) * Number(node.config.height)) /
        Math.max(1, Number(node.config.pointCount))
    );
    const debugRadius = clamp(averageCellSpan * 0.08, 0.35, 1.25);

    return [
      {
        points: result.boundary,
        closed: true,
      },
      ...result.seedPoints.map((point) => makeCirclePath(point.x, point.y, debugRadius, 24)),
    ];
  }

  if (node.kind === "trochoid") {
    return [
      makeCirclePath(
        Number(node.config.centerX),
        Number(node.config.centerY),
        Number(node.config.figureRadius),
        80
      ),
    ];
  }

  if (node.kind === "terrain-slice") {
    const geometry = generateTerrainSliceGeometry({
      center: {
        x: Number(node.config.centerX),
        y: Number(node.config.centerY),
      },
      seed: Number(node.config.seed),
      planeWidth: Number(node.config.width),
      planeDepth: Number(node.config.height),
      terrainOffsetX: Number(node.config.terrainOffsetX),
      terrainOffsetY: Number(node.config.terrainOffsetY),
      mountainScale: Number(node.config.mountainScale),
      height: Number(node.config.relief),
      waterLevel: Number(node.config.waterLevel),
      contourLevels: Number(node.config.contourLevels),
      hatchSpacing: Number(node.config.hatchSpacing),
      roughness: Number(node.config.roughness),
      waterSpacing: Number(node.config.waterSpacing),
    });

    return [geometry.planeOutline, geometry.baseOutline];
  }

  if (node.kind === "mask-circle") {
    return [
      makeCirclePath(
        Number(node.config.centerX),
        Number(node.config.centerY),
        Number(node.config.radius),
        80
      ),
    ];
  }

  if (node.kind === "mask-rect") {
    return [
      polygonToPolyline(
        makeRotatedRectPolygon(
          {
            x: Number(node.config.centerX),
            y: Number(node.config.centerY),
          },
          Number(node.config.width),
          Number(node.config.height),
          Number(node.config.rotationDeg)
        )
      ),
    ];
  }

  if (node.kind === "mask-polygon") {
    return [
      polygonToPolyline(
        makeRegularPolygon(
          {
            x: Number(node.config.centerX),
            y: Number(node.config.centerY),
          },
          Number(node.config.radius),
          Number(node.config.sides),
          Number(node.config.rotationDeg)
        )
      ),
    ];
  }

  if (node.kind === "mask-svg") {
    const data = svgMaskData(node.config);
    return data ? [svgMaskFramePath(data, svgMaskPlacement(node.config))] : [];
  }

  return [];
}

export function nodeAnchorPoint(node: ComposerNode): Point | null {
  if ("centerX" in node.config && "centerY" in node.config) {
    return {
      x: Number(node.config.centerX),
      y: Number(node.config.centerY),
    };
  }

  return null;
}

export function buildNodeComposerLayers(
  programState: NodeComposerProgramState,
  options: Readonly<{
    mode: "preview" | "export" | "validation";
    showDebug: boolean;
  }>
): Readonly<{
  layers: readonly PlotLayer[];
  debugLayers?: readonly PlotLayer[];
}> {
  const nodesById = new Map(programState.nodes.map((node) => [node.id, node]));
  const incomingByInputKey = new Map(
    programState.connections.map((connection) => [
      inputKey(connection.to.nodeId, connection.to.portId),
      connection,
    ])
  );
  const context: EvaluationContext = {
    nodesById,
    incomingByInputKey,
    mode: options.mode,
  };
  const cache = new Map<string, RuntimeOutputs>();
  const visiting = new Set<string>();

  const evaluateNode = (nodeId: string): RuntimeOutputs => {
    if (cache.has(nodeId)) {
      return cache.get(nodeId)!;
    }

    if (visiting.has(nodeId)) {
      return {};
    }

    const node = nodesById.get(nodeId);
    if (!node) {
      return {};
    }

    visiting.add(nodeId);
    const outputs = evaluateNodeOutputs(node, context, evaluateNode);
    visiting.delete(nodeId);
    cache.set(nodeId, outputs);
    return outputs;
  };

  const layers = programState.nodes.flatMap((node) => {
    if (node.kind !== "output-layer" || !Boolean(node.config.enabled)) {
      return [];
    }

    const connection = incomingByInputKey.get(inputKey(node.id, "paths"));
    if (!connection) {
      return [];
    }

    const outputs = evaluateNode(connection.from.nodeId);
    const runtimeValue = outputs[connection.from.portId];
    if (!runtimeValue || runtimeValue.kind !== "paths" || runtimeValue.paths.length === 0) {
      return [];
    }

    return [
      {
        id: `output-${node.id}`,
        label: String(node.config.label ?? "Layer"),
        stroke: styleToStroke(String(node.config.style ?? "primary")),
        paths: runtimeValue.paths,
      } satisfies PlotLayer,
    ];
  });

  const debugLayers = options.showDebug
    ? [
        {
          id: "node-guides",
          label: "Node Guides",
          stroke: plotPalette.mask,
          paths: clipPathsToContent(programState.nodes.flatMap((node) => guidePathsForNode(node))),
        } satisfies PlotLayer,
      ]
    : undefined;

  return {
    layers,
    debugLayers,
  };
}
