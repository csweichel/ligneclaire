import type { Point, Polyline } from "./document";

export type TrochoidMode = "hypotrochoid" | "epitrochoid";

export type TrochoidOptions = Readonly<{
  fixedRadius: number;
  rollingRadius: number;
  pointOffset: number;
  samplesPerTurn?: number;
  turns?: number;
  rotation?: number;
  center?: Point;
}>;

type ResolvedTrochoidOptions = Readonly<{
  fixedRadius: number;
  rollingRadius: number;
  pointOffset: number;
  samplesPerTurn: number;
  turns: number;
  rotation: number;
  center: Point;
}>;

function integerGcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return Math.max(1, a);
}

function normalizeTrochoidOptions(options: TrochoidOptions): ResolvedTrochoidOptions {
  const fixedRadius =
    Number.isFinite(options.fixedRadius) && Math.abs(options.fixedRadius) > 1e-6
      ? Math.abs(options.fixedRadius)
      : 1;
  const rollingRadius =
    Number.isFinite(options.rollingRadius) && Math.abs(options.rollingRadius) > 1e-6
      ? Math.abs(options.rollingRadius)
      : 1;
  const pointOffset = Number.isFinite(options.pointOffset) ? options.pointOffset : rollingRadius;
  const samplesPerTurn =
    Number.isFinite(options.samplesPerTurn) && options.samplesPerTurn !== undefined
      ? Math.max(24, Math.floor(options.samplesPerTurn))
      : 240;
  const roundedFixedRadius = Math.max(1, Math.round(fixedRadius));
  const roundedRollingRadius = Math.max(1, Math.round(rollingRadius));
  const closedTurns = roundedRollingRadius / integerGcd(roundedFixedRadius, roundedRollingRadius);
  const turns =
    Number.isFinite(options.turns) && options.turns !== undefined
      ? Math.max(1, options.turns)
      : closedTurns;
  const rotation =
    Number.isFinite(options.rotation) && options.rotation !== undefined ? options.rotation : 0;
  const center =
    options.center &&
    Number.isFinite(options.center.x) &&
    Number.isFinite(options.center.y)
      ? options.center
      : { x: 0, y: 0 };

  return {
    fixedRadius,
    rollingRadius,
    pointOffset,
    samplesPerTurn,
    turns,
    rotation,
    center,
  };
}

function sampleTrochoidPoint(
  mode: TrochoidMode,
  fixedRadius: number,
  rollingRadius: number,
  pointOffset: number,
  angle: number
): Point {
  const orbitRadius =
    mode === "epitrochoid" ? fixedRadius + rollingRadius : fixedRadius - rollingRadius;
  const spin = (orbitRadius / rollingRadius) * angle;

  if (mode === "epitrochoid") {
    return {
      x: orbitRadius * Math.cos(angle) - pointOffset * Math.cos(spin),
      y: orbitRadius * Math.sin(angle) - pointOffset * Math.sin(spin),
    };
  }

  return {
    x: orbitRadius * Math.cos(angle) + pointOffset * Math.cos(spin),
    y: orbitRadius * Math.sin(angle) - pointOffset * Math.sin(spin),
  };
}

export function sampleTrochoid(mode: TrochoidMode, options: TrochoidOptions): Polyline {
  const resolved = normalizeTrochoidOptions(options);
  const totalAngle = Math.PI * 2 * resolved.turns;
  const totalSamples = Math.max(1, Math.ceil(resolved.samplesPerTurn * resolved.turns));
  const sinRotation = Math.sin(resolved.rotation);
  const cosRotation = Math.cos(resolved.rotation);

  const points = Array.from({ length: totalSamples + 1 }, (_, index) => {
    const amount = index / totalSamples;
    const base = sampleTrochoidPoint(
      mode,
      resolved.fixedRadius,
      resolved.rollingRadius,
      resolved.pointOffset,
      totalAngle * amount
    );

    return {
      x: resolved.center.x + base.x * cosRotation - base.y * sinRotation,
      y: resolved.center.y + base.x * sinRotation + base.y * cosRotation,
    };
  });

  return { points };
}

export function sampleHypotrochoid(options: TrochoidOptions): Polyline {
  return sampleTrochoid("hypotrochoid", options);
}

export function sampleEpitrochoid(options: TrochoidOptions): Polyline {
  return sampleTrochoid("epitrochoid", options);
}
