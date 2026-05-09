import type { NodeConnection, NodeEndpoint } from "./model";

export type TapConnectHandle = Readonly<
  | {
      kind: "source";
      endpoint: NodeEndpoint;
    }
  | {
      kind: "target";
      endpoint: NodeEndpoint;
    }
>;

export type TapConnectResolution = Readonly<{
  candidate: NodeConnection | null;
  nextPendingSource: NodeEndpoint | null;
}>;

function sameEndpoint(left: NodeEndpoint | null, right: NodeEndpoint): boolean {
  return left?.nodeId === right.nodeId && left.portId === right.portId;
}

export function resolveTapConnection(
  pendingSource: NodeEndpoint | null,
  handle: TapConnectHandle
): TapConnectResolution {
  if (handle.kind === "source") {
    return {
      candidate: null,
      nextPendingSource: sameEndpoint(pendingSource, handle.endpoint) ? null : handle.endpoint,
    };
  }

  if (!pendingSource) {
    return {
      candidate: null,
      nextPendingSource: null,
    };
  }

  return {
    candidate: {
      from: pendingSource,
      to: handle.endpoint,
    },
    nextPendingSource: pendingSource,
  };
}
