export const contourTemplates = {
  ribbon: {
    lineScale: 1.05,
    controls: [
      { x: 0.14, y: 0.86 },
      { x: 0.14, y: 0.18 },
      { x: 0.4, y: 0.18 },
      { x: 0.42, y: 0.7 },
      { x: 0.58, y: 0.7 },
      { x: 0.74, y: 0.42 },
      { x: 0.9, y: 0.8 },
    ],
  },
  comb: {
    lineScale: 1.2,
    controls: [
      { x: 0.2, y: 0.88 },
      { x: 0.2, y: 0.18 },
      { x: 0.84, y: 0.18 },
      { x: 0.84, y: 0.36 },
      { x: 0.32, y: 0.36 },
      { x: 0.32, y: 0.54 },
      { x: 0.84, y: 0.54 },
      { x: 0.84, y: 0.72 },
      { x: 0.28, y: 0.72 },
    ],
  },
  sBend: {
    lineScale: 0.9,
    controls: [
      { x: 0.14, y: 0.78 },
      { x: 0.32, y: 0.78 },
      { x: 0.5, y: 0.22 },
      { x: 0.66, y: 0.78 },
      { x: 0.86, y: 0.22 },
    ],
  },
  wave: {
    lineScale: 0.95,
    controls: [
      { x: 0.58, y: 0.92 },
      { x: 0.18, y: 0.76 },
      { x: 0.72, y: 0.56 },
      { x: 0.26, y: 0.36 },
      { x: 0.74, y: 0.14 },
    ],
  },
  hook: {
    lineScale: 1,
    controls: [
      { x: 0.78, y: 0.94 },
      { x: 0.28, y: 0.78 },
      { x: 0.74, y: 0.38 },
      { x: 0.4, y: 0.12 },
      { x: 0.9, y: 0.08 },
    ],
  },
  u: {
    lineScale: 1.25,
    controls: [
      { x: 0.18, y: 0.12 },
      { x: 0.18, y: 0.88 },
      { x: 0.82, y: 0.88 },
      { x: 0.82, y: 0.12 },
    ],
  },
  base: {
    lineScale: 1.35,
    controls: [
      { x: 0.88, y: 0.24 },
      { x: 0.16, y: 0.24 },
      { x: 0.16, y: 0.78 },
      { x: 0.82, y: 0.78 },
      { x: 0.82, y: 0.44 },
      { x: 0.28, y: 0.44 },
    ],
  },
} as const;

export const contourLayout = [
  {
    box: { x: 0.02, y: 0.03, w: 0.45, h: 0.18 },
    template: "ribbon",
  },
  {
    box: { x: 0.56, y: 0.03, w: 0.37, h: 0.33 },
    template: "comb",
  },
  {
    box: { x: 0.18, y: 0.21, w: 0.32, h: 0.17 },
    template: "sBend",
  },
  {
    box: { x: 0.03, y: 0.38, w: 0.24, h: 0.34 },
    template: "wave",
  },
  {
    box: { x: 0.28, y: 0.46, w: 0.3, h: 0.28 },
    template: "hook",
  },
  {
    box: { x: 0.58, y: 0.43, w: 0.35, h: 0.49 },
    template: "u",
  },
  {
    box: { x: 0.05, y: 0.78, w: 0.54, h: 0.15 },
    template: "base",
  },
] as const;
