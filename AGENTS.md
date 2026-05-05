# LigneClaire Agent Guide

## Architecture

- `programs/` is the human- and agent-authored source of truth for plot programs.
- `packages/engine` owns deterministic render primitives: plot document types, normalization, metrics, geometry validation, and SVG serialization.
- `packages/sdk` owns the authoring contract: `defineProgram`, parameter builders, validation declarations, and editor typing.
- `packages/node-runtime` is the only layer that may touch the filesystem or spawn local tools such as `vpype`.
- `apps/studio` talks to the runtime through explicit HTTP endpoints under `/api/*`.
- `packages/cli` is a thin non-interactive wrapper over the runtime.

## Program Folder Contract

Every program folder must contain:

- `index.ts`
- `README.md`
- `params/default.json`
- `tests/<program>.test.ts`

Optional files:

- `editor.tsx`
- `assets/*`
- additional parameter sets in `params/`

## Allowed Imports

Programs and custom editors may import from:

- `@ligneclaire/engine`
- `@ligneclaire/sdk`
- `@ligneclaire/ui` for editor-facing helpers only
- other repo-local program files within the same program folder

## Forbidden Imports

Programs and custom editors must not import:

- `fs`, `node:fs`
- `net`, `node:net`
- `http`, `node:http`
- `https`, `node:https`
- `child_process`, `node:child_process`
- remote loaders, `eval`, `new Function`, or runtime code fetch helpers

## Parameter Rules

- Supported generated inspector types: `int`, `float`, `bool`
- `int` and `float` require `min`, `max`, and `default`
- `bool` requires `default`
- Parameter keys must be stable ASCII-safe identifiers
- Normalization and clamping happen on load, save, preview, export, and validation
- Extra persisted editor data belongs under `programState`, never inside undeclared `params`

## Safe Commands

```bash
pnpm install --frozen-lockfile
pnpm generate:registry
pnpm typecheck
pnpm test
pnpm lc validate-program --program <id> --strict --json --out-dir .artifacts/validate/<id>
pnpm lc render --program <id> --params default --out out/<id>.svg
pnpm runtime
pnpm studio
```

## Validation Expectations

- Every program must declare at least one checked-in validation case.
- `validate-program --strict` renders each case twice and fails on metric or SVG drift.
- Debug geometry must stay isolated from export geometry.
- Tests should cover schema normalization, render determinism, and representative output structure.

