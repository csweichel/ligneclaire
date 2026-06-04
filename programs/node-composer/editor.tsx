import { ProgramEditorPanel, ProgramEditorWorkspace } from "@ligneclaire/ui";
import { useMemo, type JSX } from "react";
import type { ProgramEditorProps } from "@ligneclaire/sdk";
import { NodeComposerGraph } from "./graph";
import { NodeComposerInspector } from "./inspector";
import {
  addNode,
  applyProgramNodeParamSet,
  disconnectInput,
  moveNodeAnchor,
  nodeCategories,
  nodeSpecs,
  patchNodeConfig,
  removeNode,
  selectedNode,
  selectProgramNodeProgram,
  type NodeComposerProgramState,
  type NodeComposerSchema,
} from "./model";
import { NodeComposerOverlay } from "./overlay";

type Props = ProgramEditorProps<NodeComposerSchema, NodeComposerProgramState>;

export default function NodeComposerEditor({
  canvas,
  preview,
  programState,
  updateProgramState,
}: Props): JSX.Element {
  const selected = useMemo(() => selectedNode(programState), [programState]);

  return (
    <>
      <ProgramEditorPanel className="lc-node-composer__panel">
        <div className="lc-editor-overlay lc-node-composer__layout">
          <div className="lc-editor-overlay__header">
            <p className="lc-editor-overlay__eyebrow">Program Editor</p>
            <h3 className="lc-editor-overlay__title">Node Composer</h3>
          </div>

          <p className="lc-editor-overlay__copy">
            Compose generators, masks, and processing steps into plotted layers. Drag nodes in the
            graph, connect handles directly in the flow view, then move the selected node directly
            on the sheet with the overlay handle.
          </p>

          <section className="lc-node-composer__section">
            <div className="lc-node-composer__section-header">
              <div>
                <p className="studio-eyebrow">Palette</p>
                <h3 className="lc-editor-overlay__title">Add Nodes</h3>
              </div>
            </div>

            <div className="lc-node-composer__palette">
              {nodeCategories.map((category) => (
                <div key={category.id} className="lc-node-composer__palette-group">
                  <span className="lc-node-composer__palette-title">{category.label}</span>
                  <div className="lc-node-composer__palette-buttons">
                    {Object.values(nodeSpecs)
                      .filter((spec) => spec.category === category.id)
                      .map((spec) => (
                        <button
                          key={spec.kind}
                          className="studio-button studio-button--compact"
                          type="button"
                          onClick={() => {
                            updateProgramState((current) => addNode(current, spec.kind));
                          }}
                        >
                          {spec.title}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <NodeComposerInspector
            programState={programState}
            selectedNode={selected}
            onDisconnectInput={(nodeId, portId) => {
              updateProgramState((current) => disconnectInput(current, nodeId, portId));
            }}
            onPatchConfig={(nodeId, patch) => {
              updateProgramState((current) => patchNodeConfig(current, nodeId, patch));
            }}
            onSelectProgram={(nodeId, programId) => {
              updateProgramState((current) => selectProgramNodeProgram(current, nodeId, programId));
            }}
            onSelectParamSet={(nodeId, paramSetId) => {
              updateProgramState((current) => applyProgramNodeParamSet(current, nodeId, paramSetId));
            }}
            onRemoveNode={(nodeId) => {
              updateProgramState((current) => removeNode(current, nodeId));
            }}
          />
        </div>
      </ProgramEditorPanel>

      <ProgramEditorWorkspace
        className="lc-node-composer__workspace"
        tabLabel="Graph"
      >
        <NodeComposerGraph
          layout="workspace"
          programState={programState}
          updateProgramState={updateProgramState}
        />
      </ProgramEditorWorkspace>

      <NodeComposerOverlay
        preview={preview}
        selectedNode={selected}
        onMoveAnchor={(point) => {
          if (!selected) {
            return;
          }

          updateProgramState((current) => moveNodeAnchor(current, selected.id, point, canvas));
        }}
      />
    </>
  );
}
