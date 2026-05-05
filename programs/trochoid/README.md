# Trochoid Figure

`trochoid` generates a single placed spirograph-style figure and can switch between hypotrochoid and epitrochoid motion.

## Parameters

- `useEpitrochoid`: switch between interior and exterior rolling motion
- `fixedRadius`: radius of the stationary circle
- `rollingRadius`: radius of the moving circle
- `pointOffsetRatio`: pen distance from the moving circle center, as a multiple of the rolling radius
- `figureRadius`: maximum placed radius on the sheet
- `rotationDeg`: figure rotation
- `samplesPerTurn`: sampling density for the generated path

## Placement

- Use the editor overlay to drag the figure center on the sheet.
- The placed radius automatically fits inside the remaining safe content area around the chosen center.

## Validation Cases

- `default`: the baseline centered hypotrochoid
