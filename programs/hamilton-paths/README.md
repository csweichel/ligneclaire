# Hamilton Paths

`hamilton-paths` lays a single Hamiltonian walk across a configurable lattice, then renders it as a configurable bundle of parallel strokes.

## Parameters

- `seed`: deterministic scramble seed for the Hamiltonian walk
- `columns`: number of grid columns
- `rows`: number of grid rows
- `gridRotationDeg`: rotates the entire base lattice
- `latticeAngleDeg`: angle between the column and row lattice vectors; `60` yields a hex-like triangular arrangement
- `rowStepRatio`: scales the row lattice vector relative to the column vector
- `strokeCount`: number of parallel strokes to draw
- `strokeSpacing`: spacing between adjacent strokes
- `cornerRadius`: amount of corner rounding applied to each stroke; each lane adjusts that radius by its offset
- `deflection`: diagonal corner pull; `0` keeps the straight runs exactly horizontal or vertical
- `drawCenterlines`: draws the centerlines between configured strokes, so it emits one fewer line than `strokeCount`
- debug mode: draws the fitted base nodes so you can inspect the underlying lattice

## Validation Cases

- `default`: portrait grid with three parallel strokes
