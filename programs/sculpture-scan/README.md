# Sculpture Scan

`sculpture-scan` builds a field of vertical scan lines, then pushes them sideways with a deterministic smooth-mass deformation field to suggest a carved relief surface.

## Parameters

- `seed`: deterministic placement for the sculpting masses and warp field
- `lineSpacing`: approximate spacing between scan lines
- `sampleStep`: deformation sampling step along each scan line
- `relief`: maximum lateral displacement applied by the modifier
- `features`: number of sculpting masses in the field
- `featureRadius`: base radius of each sculpting mass
- `stretch`: vertical elongation of the masses
- `detail`: amount of secondary smaller-scale relief nested inside the main masses
- `warp`: secondary turbulence layered onto the base surface

## Validation Cases

- `default`: the reference sculpted scanline surface
