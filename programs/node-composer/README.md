# Node Composer

`node-composer` is a low-code program that lets you assemble plot images from reusable node blocks instead of starting from a fixed generator.

## Included Node Types

- Path generators: `Line Grid`, `Perlin Field`, `Circle Grid`, `Image Circles`, `Trochoid`
- Masks: `Circle Mask`, `Rectangle Mask`, `Polygon Mask`
- Processing: `Mask Boolean`, `Clip Mask`, `Merge Paths`
- Output: `Output Layer`

## Current Model

- Nodes exchange either `paths` or `mask` values.
- Multiple `Output Layer` nodes let one graph emit multi-color art layers.
- Boolean operations apply to masks, then those masks can clip or exclude paths.
- The bundled image-sampling node uses the repository’s built-in reference image.

## Current Limitation

The engine does not yet expose general path boolean geometry. In this first version, union, subtraction, difference, and intersection operate on masks, not on arbitrary path sets.
