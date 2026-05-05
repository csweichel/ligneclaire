# Trochoid Figure

`trochoid` generates one or more placed spirograph-style figures, with each figure carrying its own hypotrochoid or epitrochoid settings.

## Figure Controls

- `useEpitrochoid`: switch the selected figure between interior and exterior rolling motion
- `fixedRadius`: radius of the stationary circle
- `rollingRadius`: radius of the moving circle
- `pointOffsetRatio`: pen distance from the moving circle center, as a multiple of the rolling radius
- `figureRadius`: placed radius of the selected figure
- `rotationDeg`: figure rotation
- `samplesPerTurn`: sampling density for the generated path

## Placement

- Use the editor overlay to add, remove, select, and drag figure centers on the sheet.
- Each figure stores its own geometry, so changing one figure does not affect the others.
- Figure size stays fixed while moving; placement is clamped so figures remain inside the safe content area.

## Validation Cases

- `default`: the baseline centered hypotrochoid
