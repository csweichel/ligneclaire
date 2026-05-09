import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { ComposerFlowNode, type ComposerFlowNodeType } from "./flowNode";
import {
  canConnectNodes,
  connectNodes,
  connectionId,
  disconnectConnection,
  moveNode,
  nodeKindLabel,
  nodeLabel,
  type NodeEndpoint,
  nodeSpec,
  selectComposerNode,
  type NodeComposerProgramState,
  type NodeConnection,
} from "./model";
import { resolveTapConnection, type TapConnectHandle } from "./tapConnect";

type NodeComposerGraphProps = Readonly<{
  layout?: "panel" | "workspace";
  programState: NodeComposerProgramState;
  updateProgramState: (
    updater: (current: NodeComposerProgramState) => NodeComposerProgramState
  ) => void;
}>;

type ComposerFlowEdge = Edge<
  Readonly<{
    connection: NodeConnection;
  }>
>;

type ComposerFlowNode = Node<ComposerFlowNodeType["data"], "composer">;

const nodeTypes = {
  composer: ComposerFlowNode,
} satisfies NodeTypes;

function connectionFromFlow(connection: Connection): NodeConnection | null {
  if (
    !connection.source ||
    !connection.sourceHandle ||
    !connection.target ||
    !connection.targetHandle
  ) {
    return null;
  }

  return {
    from: {
      nodeId: connection.source,
      portId: connection.sourceHandle,
    },
    to: {
      nodeId: connection.target,
      portId: connection.targetHandle,
    },
  };
}

function tapConnectEnabled(): boolean {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    if (
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(hover: none)").matches
    ) {
      return true;
    }
  }

  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
}

export function NodeComposerGraph({
  layout = "panel",
  programState,
  updateProgramState,
}: NodeComposerGraphProps): JSX.Element {
  const isWorkspace = layout === "workspace";
  const draggingNodeIdRef = useRef<string | null>(null);
  const [pendingTapSource, setPendingTapSource] = useState<NodeEndpoint | null>(null);
  const manualTapConnect = tapConnectEnabled();

  const handleTapConnection = useCallback(
    (handle: TapConnectHandle): void => {
      if (!manualTapConnect) {
        return;
      }

      const resolution = resolveTapConnection(pendingTapSource, handle);
      const candidate = resolution.candidate;
      if (!candidate) {
        setPendingTapSource(resolution.nextPendingSource);
        return;
      }

      if (canConnectNodes(programState, candidate)) {
        updateProgramState((current) => connectNodes(current, candidate));
        setPendingTapSource(null);
        return;
      }

      setPendingTapSource(resolution.nextPendingSource);
    },
    [manualTapConnect, pendingTapSource, programState, updateProgramState]
  );

  useEffect(() => {
    if (!manualTapConnect && pendingTapSource) {
      setPendingTapSource(null);
    }
  }, [manualTapConnect, pendingTapSource]);

  useEffect(() => {
    if (!pendingTapSource) {
      return;
    }

    const sourceNode = programState.nodes.find((node) => node.id === pendingTapSource.nodeId);
    if (!sourceNode) {
      setPendingTapSource(null);
      return;
    }

    const sourceStillExists = nodeSpec(sourceNode.kind).outputs.some(
      (output) => output.id === pendingTapSource.portId
    );
    if (!sourceStillExists) {
      setPendingTapSource(null);
    }
  }, [pendingTapSource, programState.nodes]);

  const flowNodes = useMemo(() => {
    const incomingConnections = new Map<string, NodeConnection>();
    const outgoingCounts = new Map<string, number>();

    for (const connection of programState.connections) {
      incomingConnections.set(
        `${connection.to.nodeId}:${connection.to.portId}`,
        connection
      );
      const outputKey = `${connection.from.nodeId}:${connection.from.portId}`;
      outgoingCounts.set(outputKey, (outgoingCounts.get(outputKey) ?? 0) + 1);
    }

    return programState.nodes.map((node) => {
      const spec = nodeSpec(node.kind);

      return {
        id: node.id,
        type: "composer",
        position: node.position,
        selected: node.id === programState.selectedNodeId,
        dragHandle: ".lc-node-composer__flow-node-header",
        ariaLabel: nodeLabel(programState, node.id),
        data: {
          label: nodeLabel(programState, node.id),
          kindLabel: nodeKindLabel(node),
          manualConnectEnabled: manualTapConnect,
          onManualInputPress: (portId) => {
            handleTapConnection({
              kind: "target",
              endpoint: {
                nodeId: node.id,
                portId,
              },
            });
          },
          onManualOutputPress: (portId) => {
            handleTapConnection({
              kind: "source",
              endpoint: {
                nodeId: node.id,
                portId,
              },
            });
          },
          inputs: spec.inputs.map((input) => {
            const incoming = incomingConnections.get(`${node.id}:${input.id}`);
            return {
              id: input.id,
              label: input.label,
              sourceLabel: incoming
                ? nodeLabel(programState, incoming.from.nodeId)
                : null,
            };
          }),
          outputs: spec.outputs.map((output) => ({
            id: output.id,
            label: output.label,
            connectionCount: outgoingCounts.get(`${node.id}:${output.id}`) ?? 0,
            isPending:
              pendingTapSource?.nodeId === node.id && pendingTapSource.portId === output.id,
          })),
        },
      } satisfies ComposerFlowNodeType;
    });
  }, [handleTapConnection, manualTapConnect, pendingTapSource, programState]);
  const [graphNodes, setGraphNodes] = useState<ComposerFlowNode[]>(flowNodes);

  useEffect(() => {
    if (draggingNodeIdRef.current) {
      return;
    }

    setGraphNodes(flowNodes);
  }, [flowNodes]);

  const flowEdges = useMemo(
    () =>
      programState.connections.map((connection) => ({
        id: connectionId(connection),
        source: connection.from.nodeId,
        target: connection.to.nodeId,
        sourceHandle: connection.from.portId,
        targetHandle: connection.to.portId,
        type: "smoothstep",
        className: "lc-node-composer__flow-edge",
        data: {
          connection,
        },
      })) satisfies readonly ComposerFlowEdge[],
    [programState.connections]
  );

  function patchGraphNodePosition(
    nodes: ComposerFlowNode[],
    nodeId: string,
    position: ComposerFlowNode["position"]
  ): ComposerFlowNode[] {
    return nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            position,
          }
        : node
    );
  }

  return (
    <section
      className={`lc-node-composer__section${isWorkspace ? " lc-node-composer__section--workspace" : ""}`}
    >
      <div className="lc-node-composer__section-header">
        <div>
          <p className="studio-eyebrow">Graph</p>
          <h3 className="lc-editor-overlay__title">Signal Flow</h3>
        </div>
        <p className="lc-node-composer__section-note">
          Tap or click a source handle, then a target handle to connect. Outputs can fan out to
          multiple downstream inputs. Click an edge to remove it.
        </p>
      </div>

      <div
        className={`lc-node-composer__flow-frame${isWorkspace ? " lc-node-composer__flow-frame--workspace" : ""}`}
      >
        <ReactFlow
          attributionPosition="bottom-left"
          className={`lc-node-composer__flow${isWorkspace ? " lc-node-composer__flow--workspace" : ""}`}
          connectOnClick={!manualTapConnect}
          connectionDragThreshold={manualTapConnect ? 8 : 1}
          connectionRadius={manualTapConnect ? 30 : 20}
          deleteKeyCode={null}
          edges={flowEdges}
          edgesFocusable={false}
          fitView
          fitViewOptions={{
            padding: 0.14,
            maxZoom: 1,
          }}
          isValidConnection={(connection) => {
            const candidate = connectionFromFlow(connection);
            return candidate ? canConnectNodes(programState, candidate) : false;
          }}
          maxZoom={1.8}
          minZoom={0.2}
          nodeClickDistance={manualTapConnect ? 8 : 0}
          nodeTypes={nodeTypes}
          nodes={graphNodes}
          nodesConnectable={!manualTapConnect}
          nodesFocusable={false}
          onConnect={(connection) => {
            const candidate = connectionFromFlow(connection);
            if (!candidate) {
              return;
            }

            updateProgramState((current) => connectNodes(current, candidate));
            setPendingTapSource(null);
          }}
          onEdgeClick={(_event, edge) => {
            const connection = edge.data?.connection;
            if (!connection) {
              return;
            }

            setPendingTapSource(null);
            updateProgramState((current) => disconnectConnection(current, connection));
          }}
          onPaneClick={() => {
            setPendingTapSource(null);
          }}
          onNodeClick={(_event, node) => {
            setPendingTapSource(null);
            updateProgramState((current) => selectComposerNode(current, node.id));
          }}
          onNodeDragStart={(_event, node) => {
            draggingNodeIdRef.current = node.id;
          }}
          onNodeDrag={(_event, node) => {
            setGraphNodes((currentNodes) =>
              patchGraphNodePosition(currentNodes, node.id, node.position)
            );
          }}
          onNodeDragStop={(_event, node) => {
            draggingNodeIdRef.current = null;
            setGraphNodes((currentNodes) =>
              patchGraphNodePosition(currentNodes, node.id, node.position)
            );
            updateProgramState((current) => moveNode(current, node.id, node.position));
          }}
          panOnDrag={!manualTapConnect}
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          paneClickDistance={manualTapConnect ? 8 : 0}
          proOptions={{
            hideAttribution: true,
          }}
          selectionOnDrag={false}
        >
          <Background color="rgba(31, 41, 55, 0.08)" gap={24} size={1} />
          <Controls position="top-right" showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}
