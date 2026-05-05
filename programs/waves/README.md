# Focused Waves

`waves` renders alternating bands of sine-driven lines whose amplitude is pulled toward a draggable focus point.

## Parameters

- `seed`: deterministic noise seed
- `bands`: number of wave paths
- `amplitude`: base vertical displacement in millimeters
- `frequency`: wave frequency multiplier
- `warp`: secondary Perlin warp strength
- `mirror`: adds mirrored counter-motion across the page

## Program State

- `focus`: draggable point that locally amplifies the wave field
- `falloff`: controls how widely the focus affects neighboring bands

## Validation Cases

- `default`: balanced preview-friendly render
- `dense-a3`: denser render for complexity budgets

