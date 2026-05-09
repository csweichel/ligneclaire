import { describe, expect, it } from "vitest";
import { resolveTapConnection } from "../tapConnect";

describe("node-composer tap connect helper", () => {
  it("arms a source handle and toggles it off when tapped again", () => {
    const armed = resolveTapConnection(null, {
      kind: "source",
      endpoint: {
        nodeId: "node-1",
        portId: "paths",
      },
    });

    expect(armed.candidate).toBeNull();
    expect(armed.nextPendingSource).toEqual({
      nodeId: "node-1",
      portId: "paths",
    });

    const cleared = resolveTapConnection(armed.nextPendingSource, {
      kind: "source",
      endpoint: {
        nodeId: "node-1",
        portId: "paths",
      },
    });

    expect(cleared.candidate).toBeNull();
    expect(cleared.nextPendingSource).toBeNull();
  });

  it("builds a candidate connection when a target follows a pending source", () => {
    const resolution = resolveTapConnection(
      {
        nodeId: "node-1",
        portId: "paths",
      },
      {
        kind: "target",
        endpoint: {
          nodeId: "node-2",
          portId: "mask",
        },
      }
    );

    expect(resolution.candidate).toEqual({
      from: {
        nodeId: "node-1",
        portId: "paths",
      },
      to: {
        nodeId: "node-2",
        portId: "mask",
      },
    });
    expect(resolution.nextPendingSource).toEqual({
      nodeId: "node-1",
      portId: "paths",
    });
  });

  it("ignores target taps until a source handle is pending", () => {
    const resolution = resolveTapConnection(null, {
      kind: "target",
      endpoint: {
        nodeId: "node-2",
        portId: "mask",
      },
    });

    expect(resolution.candidate).toBeNull();
    expect(resolution.nextPendingSource).toBeNull();
  });
});
