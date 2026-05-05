# Clipped Field

`clip-field` ports the void-cut flow field from `go-pen`, keeping the central polygon as excluded negative space.

## Parameters

- `seed`: deterministic field seed
- `primaryPaths`: number of darker field traces
- `accentPaths`: number of lighter secondary traces
- `maskScale`: scale of the excluded polygon
- `segmentLength`: travel distance per field step
- `steps`: number of steps per traced path
- `continuousCurves`: smooth traces with interpolated field sampling

## Validation Cases

- `default`: a balanced clipped composition
