# Plot Program Authoring

Use this skill when creating or editing a plot program under `programs/`.

## Minimal Workflow

1. Read `spec.md` and `AGENTS.md`.
2. Create or update the program folder under `programs/<id>/`.
3. Define the program with `defineProgram(...)` in `index.ts`.
4. Keep scalar framework-managed values inside `params`.
5. Keep richer persisted editor data inside `programState`.
6. Save at least one checked-in parameter set in `params/default.json`.
7. Add a `README.md` describing the visual idea, parameters, and validation cases.
8. Add `tests/<id>.test.ts` covering render structure or determinism.
9. Run `pnpm generate:registry`, `pnpm typecheck`, and `pnpm lc validate-program --program <id> --strict`.

## Required Files

- `index.ts`
- `README.md`
- `params/default.json`
- `tests/<id>.test.ts`

## Custom Editor Checklist

- Keep editor-only transient interaction state out of persisted parameter sets.
- Only write declared scalar values into `params`.
- Put richer saved data into `programState`.
- Use preview coordinate helpers instead of hand-rolled transforms.
- Keep debug overlays in `debugLayers`, never in exported art layers.

## Default Parameter Set Checklist

- `programId` matches the program definition
- `programVersion` matches the current program version
- `name` is human-readable
- `params` includes every declared scalar parameter
- `programState` is omitted or JSON-serializable

