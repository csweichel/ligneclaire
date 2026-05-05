import type { GrayscaleImageGrid } from "./image";

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function gaussian(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number
): number {
  const dx = (x - centerX) / Math.max(1e-6, radiusX);
  const dy = (y - centerY) / Math.max(1e-6, radiusY);
  return Math.exp(-(dx * dx + dy * dy) * 0.5);
}

function buildReferencePortraitGrid(columns: number, rows: number): GrayscaleImageGrid {
  const values: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    const y = row / (rows - 1);

    for (let column = 0; column < columns; column += 1) {
      const x = column / (columns - 1);
      let luminosity = 248;

      const vignette = Math.hypot(x - 0.52, y - 0.56);
      luminosity -= Math.max(0, 1 - vignette / 0.82) * 28;

      const shoulders = gaussian(x, y, 0.52, 0.14, 0.34, 0.18);
      const jacket = gaussian(x, y, 0.52, 0.1, 0.3, 0.13);
      luminosity -= shoulders * 120;
      luminosity -= jacket * 80;

      const face = gaussian(x, y, 0.53, 0.58, 0.19, 0.24);
      const hair = gaussian(x, y, 0.52, 0.78, 0.28, 0.22);
      const hairSides =
        gaussian(x, y, 0.37, 0.62, 0.08, 0.18) + gaussian(x, y, 0.69, 0.6, 0.09, 0.18);
      luminosity -= face * 70;
      luminosity -= hair * 130;
      luminosity -= hairSides * 58;

      const neck = gaussian(x, y, 0.53, 0.36, 0.06, 0.08);
      const nose = gaussian(x, y, 0.54, 0.56, 0.03, 0.09);
      const mouth = gaussian(x, y, 0.54, 0.47, 0.065, 0.025);
      luminosity -= neck * 36;
      luminosity -= nose * 34;
      luminosity -= mouth * 52;

      const leftEye = gaussian(x, y, 0.46, 0.63, 0.04, 0.018);
      const rightEye = gaussian(x, y, 0.59, 0.635, 0.045, 0.02);
      const brows = gaussian(x, y, 0.46, 0.67, 0.06, 0.02) + gaussian(x, y, 0.6, 0.68, 0.07, 0.02);
      luminosity -= leftEye * 84;
      luminosity -= rightEye * 88;
      luminosity -= brows * 26;

      const cheekHighlight = gaussian(x, y, 0.47, 0.56, 0.09, 0.12);
      const foreheadHighlight = gaussian(x, y, 0.5, 0.69, 0.08, 0.09);
      luminosity += cheekHighlight * 28;
      luminosity += foreheadHighlight * 22;

      luminosity += Math.sin(x * 13 + y * 5) * 6;
      luminosity += Math.cos(y * 22 - x * 4) * 4;

      values.push(clampByte(luminosity));
    }
  }

  return {
    columns,
    rows,
    values,
  };
}

export const goPenSampleGrid = buildReferencePortraitGrid(96, 136);
