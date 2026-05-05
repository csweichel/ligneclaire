<p align="center">
  <img src="./Logo.png" alt="LigneClaire logo" width="360" />
</p>

# LigneClaire

Local-first creative coding framework for pen plotters.

The repo is organized around a shared TypeScript engine, a thin Node runtime/CLI, a Vite + React studio, and checked-in plot programs under `programs/`. The canonical product contract lives in [spec.md](/workspaces/ligneclaire/spec.md).

## Workspace

- `apps/studio`: React + Vite + Tailwind studio UI.
- `packages/engine`: plot document model, parameter normalization, SVG serialization, metrics, and geometry helpers.
- `packages/sdk`: `defineProgram`, typed parameter builders, editor contracts, and validation helpers.
- `packages/ui`: shared studio components.
- `packages/node-runtime`: filesystem IO, registry access, render/export APIs, and tool diagnostics.
- `packages/cli`: non-interactive CLI commands.
- `programs/`: trusted in-repo plot programs and parameter sets.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm generate:registry
pnpm typecheck
pnpm test
pnpm build
pnpm lc list-programs
pnpm runtime
pnpm studio
```

## Ona Automation

The repo includes an Ona automation service at `.ona/automations.yaml`.

```bash
ona automations validate .ona/automations.yaml
ona automations update .ona/automations.yaml -s
ona automations service start studio
```

The `studio` service starts the local runtime plus the Vite studio and opens port `5173` with `creator_only` admission so only the environment owner can access it. It is configured to auto-start with the `postDevcontainerStart` automation trigger once the environment has loaded `.ona/automations.yaml`.

## Notes

- Dependencies are pinned exactly via `.npmrc` and `pnpm-lock.yaml`.
- Program discovery is generated, not arbitrary runtime directory execution.
- The browser app never touches the filesystem directly; all persistence and exports flow through the Node runtime.
