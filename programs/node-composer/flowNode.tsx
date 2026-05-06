import {
  Handle,
  Position,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import type { JSX } from "react";

export type ComposerFlowNodeInput = Readonly<{
  id: string;
  label: string;
  sourceLabel: string | null;
}>;

export type ComposerFlowNodeOutput = Readonly<{
  id: string;
  label: string;
  connectionCount: number;
}>;

export type ComposerFlowNodeData = Readonly<{
  label: string;
  kindLabel: string;
  inputs: readonly ComposerFlowNodeInput[];
  outputs: readonly ComposerFlowNodeOutput[];
}>;

export type ComposerFlowNodeType = FlowNode<ComposerFlowNodeData, "composer">;

export function ComposerFlowNode(props: NodeProps<ComposerFlowNodeType>): JSX.Element {
  const rows = Math.max(props.data.inputs.length, props.data.outputs.length, 1);

  return (
    <div className="lc-node-composer__flow-node">
      <div className="lc-node-composer__flow-node-header">
        <span className="lc-node-composer__flow-node-title">{props.data.label}</span>
        <span className="lc-node-composer__flow-node-kind">{props.data.kindLabel}</span>
      </div>

      <div className="lc-node-composer__flow-node-body">
        {Array.from({ length: rows }, (_, rowIndex) => {
          const input = props.data.inputs[rowIndex];
          const output = props.data.outputs[rowIndex];

          return (
            <div key={`${props.id}:${rowIndex}`} className="lc-node-composer__flow-row">
              <div className="lc-node-composer__flow-port-slot lc-node-composer__flow-port-slot--input">
                {input ? (
                  <>
                    <Handle
                      className={`lc-node-composer__flow-handle${input.sourceLabel ? " lc-node-composer__flow-handle--connected" : ""}`}
                      id={input.id}
                      position={Position.Left}
                      type="target"
                    />
                    <div className="lc-node-composer__flow-port-copy">
                      <span className="lc-node-composer__flow-port-label">{input.label}</span>
                      <span className="lc-node-composer__flow-port-value">
                        {input.sourceLabel ?? "Unconnected"}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="lc-node-composer__flow-port-slot lc-node-composer__flow-port-slot--output">
                {output ? (
                  <>
                    <div className="lc-node-composer__flow-port-copy lc-node-composer__flow-port-copy--output">
                      <span className="lc-node-composer__flow-port-label">{output.label}</span>
                      <span className="lc-node-composer__flow-port-value">
                        {output.connectionCount} connection{output.connectionCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <Handle
                      className={`lc-node-composer__flow-handle${output.connectionCount > 0 ? " lc-node-composer__flow-handle--connected" : ""}`}
                      id={output.id}
                      position={Position.Right}
                      type="source"
                    />
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
