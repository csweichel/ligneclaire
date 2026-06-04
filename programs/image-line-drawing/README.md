# Image Line Drawing

`image-line-drawing` imports a raster image and traces darkness contours into one continuous
polyline, in the spirit of `bio-glyph`.

## Parameters

- `maxImageDimension`: longest side used when importing an image in Studio
- `levels`: number of contour thresholds to trace
- `darknessFloor`: minimum darkness included in the trace
- `contrast`: contrast curve applied before contouring
- `simplifyMm`: Ramer-Douglas-Peucker simplification tolerance
- `minSegmentMm`: shortest contour kept before path stitching

## Program State

Imported image data and the parameter-sensitive single-line cache are stored in `programState`.
The cache key includes the image hash and trace parameters, so saved parameter sets can be reused
by node composer without retracing when the image and parameters match.

## Validation Cases

- `default`: procedural portrait reference image
