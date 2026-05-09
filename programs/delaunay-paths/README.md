# Delaunay Paths

`delaunay-paths` scatters a seeded jittered lattice across the page and connects it with the unique edges of its Delaunay triangulation.

## Parameters

- `seed`: deterministic point jitter seed
- `columns`: number of point columns
- `rows`: number of point rows
- `jitter`: how far interior points may drift from their base lattice

## Validation Cases

- `default`: portrait Delaunay edge field with visible debug points
