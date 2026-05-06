import {
  defineProgram,
  lazyEditor,
  type ProgramRenderContext,
} from "@ligneclaire/sdk";
import {
  buildNodeComposerLayers,
  canvas,
  defaultNodeComposerProgramState,
  nodeComposerParamSchema,
  normalizeNodeComposerProgramState,
  selectNodeComposerRenderState,
  type NodeComposerProgramState,
  type NodeComposerSchema,
} from "./model";

const PROGRAM_VERSION = "1.0.0";

type NodeComposerRenderContext = ProgramRenderContext<
  NodeComposerSchema,
  NodeComposerProgramState
>;

export const program = defineProgram({
  id: "node-composer",
  title: "Node Composer",
  description:
    "Build plot images from reusable generators, masks, processing nodes, and multi-layer outputs.",
  version: PROGRAM_VERSION,
  canvas,
  params: nodeComposerParamSchema,
  defaultProgramState: defaultNodeComposerProgramState,
  normalizeProgramState: normalizeNodeComposerProgramState,
  selectRenderProgramState: selectNodeComposerRenderState,
  validation: {
    cases: ["default"],
    budgets: {
      maxRenderMs: 450,
      maxArtLayers: 6,
      maxPaths: 12000,
      maxSegments: 220000,
      maxDrawDistanceMm: 600000,
      maxPenUpDistanceMm: 45000,
    },
  },
  editor: lazyEditor(() => import("./editor")),
  render(ctx: NodeComposerRenderContext) {
    const { layers, debugLayers } = buildNodeComposerLayers(ctx.programState, {
      mode: ctx.mode,
      showDebug: ctx.showDebug,
    });

    return {
      canvas,
      layers,
      debugLayers,
      metadata: {
        programId: "node-composer",
        version: PROGRAM_VERSION,
        mode: ctx.mode,
        nodeCount: String(ctx.programState.nodes.length),
        connectionCount: String(ctx.programState.connections.length),
      },
    };
  },
});
