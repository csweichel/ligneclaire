# Voronoi Nested Cells

`voronoi-nested-cells` scatters seeded points inside a centered rectangular boundary, clips their Voronoi cells to that rectangle, fillets each cell, then emits scaled and rotated nested copies around each rounded centroid.

## Parameters

- `boundaryWidth`: width of the centered rectangular Voronoi boundary
- `boundaryHeight`: height of the centered rectangular Voronoi boundary
- `pointCount`: number of random Voronoi seeds
- `randomSeed`: deterministic seed for point scattering
- `filletRadius`: target corner radius used when rounding each cell
- `layerCount`: number of nested copies per rounded cell
- `scaleBase`: per-layer scale multiplier, applied as `scaleBase^i`
- `rotationStep`: per-layer rotation increment in radians, applied as `rotationStep * i`

## Validation Cases

- `default`: rounded seeded Voronoi nests with debug seed markers and boundary
