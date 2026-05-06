# Terrain Slices

`terrain-slices` builds one procedurally generated hill rising through a water plane. The composition combines:

- a dense blue isometric water plane
- lifted terrain slice lines sampled from a procedural heightfield
- a single hill footprint that stays stable as the plane grows or shrinks

## Parameters

- `seed`: picks the terrain silhouette and peak drift
- `contourLevels`: controls the steepness profile of the generated hill
- `planeSize`: width of each isometric water plane
- `terrainOffsetX` / `terrainOffsetY`: slides the hill across the water surface plane without moving the plane itself
- `mountainScale`: hill footprint relative to the plane
- `height`: vertical lift between the base and summit
- `roughness`: amount of contour irregularity
- `waterLevel`: the slice height through the hill
- `hatchSpacing` and `waterSpacing`: line density for the hill and plane

## Node Composer

The same core generator is also exposed as the `Terrain Slice` node in `node-composer`, where terrain and water are emitted as separate outputs.
