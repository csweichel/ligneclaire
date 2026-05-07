import { afterEach, describe, expect, it } from "vitest";
import { createParamSet, deleteParamSet } from "./param-store";

const createdParamSets: Array<Readonly<{ programId: string; slug: string }>> = [];

afterEach(async () => {
  await Promise.all(
    createdParamSets.splice(0).map(async ({ programId, slug }) => {
      try {
        await deleteParamSet(programId, slug);
      } catch {
        // Ignore cleanup failures for already-removed temp files.
      }
    })
  );
});

describe("createParamSet", () => {
  it("creates a parameter set from explicit current params and program state", async () => {
    const name = `Waves Current ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const created = await createParamSet("waves", {
      name,
      params: {
        seed: 4242,
        bands: 18,
        amplitude: 21.5,
        frequency: 3.4,
        warp: 0.12,
        mirror: false,
      },
      programState: {
        focus: {
          x: 123,
          y: 222,
        },
        falloff: 0.66,
      },
    });

    createdParamSets.push({
      programId: "waves",
      slug: created.slug,
    });

    expect(created.name).toBe(name);
    expect(created.params).toEqual({
      seed: 4242,
      bands: 18,
      amplitude: 21.5,
      frequency: 3.4,
      warp: 0.12,
      mirror: false,
    });
    expect(created.programState).toEqual({
      focus: {
        x: 123,
        y: 222,
      },
      falloff: 0.66,
    });
    expect(created.normalizationIssues).toEqual([]);
  });
});
