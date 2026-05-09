# Hamilton Paths

`hamilton-paths` lays a single Hamiltonian walk across a square grid, then renders it as a configurable bundle of parallel strokes.

## Parameters

- `seed`: deterministic scramble seed for the Hamiltonian walk
- `columns`: number of grid columns
- `rows`: number of grid rows
- `strokeCount`: number of parallel strokes to draw
- `strokeSpacing`: spacing between adjacent strokes
- `cornerRadius`: amount of corner rounding applied to each stroke; each lane adjusts that radius by its offset
- `deflection`: diagonal corner pull; `0` keeps the straight runs exactly horizontal or vertical
- `drawCenterlines`: draws the centerlines between configured strokes, so it emits one fewer line than `strokeCount`

## Validation Cases

- `default`: portrait grid with three parallel strokes
