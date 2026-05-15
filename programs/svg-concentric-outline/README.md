# SVG Concentric Outline

Import an SVG outline, find its centroid, and repeatedly scale the outline down to create nested concentric draw paths.

## How It Works

- Upload an SVG with the custom editor.
- The editor samples supported SVG geometry (`path`, `polygon`, `polyline`, `rect`, `circle`, `ellipse`, `line`) into polylines.
- The program centers the imported outline set on the page, then draws repeated scaled copies of each imported outline around that outline's own centroid.

## Parameters

- `Copies`: number of concentric copies to draw, including the outermost outline.
- `Shrink Factor`: multiplicative scale applied to each successive copy. Set it to `1` to disable factor-based shrink.
- `Shrink Step`: absolute reduction per successive copy, measured in millimeters against the outline's longest dimension.
- `Size`: outermost outline size on paper, measured against the longest dimension of the imported shape.

## Notes

- The checked-in default state uses a bundled heart-like outline so validation and export work without any upload.
- Hidden geometry inside `defs`, `clipPath`, `mask`, `pattern`, `marker`, or `symbol` is ignored during import.
