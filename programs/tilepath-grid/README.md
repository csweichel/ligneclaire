# Tilepath Grid

`tilepath-grid` ports the routed line-and-arc tile sketch from `go-pen`, including a studio editor for per-cell overrides.

## Parameters

- `tile`: target tile size
- `arc`: arc tile preference in percent
- `lanes`: parallel lanes per tile
- `segments`: polyline segments per quarter arc
- `passes`: local search passes
- `restarts`: solver restarts
- `seed`: deterministic tile-field seed

## Program State

- `cells`: optional per-cell tile overrides set through the custom editor

## Validation Cases

- `default`: the default routed A4 grid
