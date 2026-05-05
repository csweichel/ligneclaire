import { createRng } from "./rng";

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function grad(hash: number, x: number, y: number): number {
  switch (hash & 3) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    default:
      return -x - y;
  }
}

export function createPerlinNoise2D(seed: number | string): (x: number, y: number) => number {
  const rng = createRng(seed);
  const permutation = Array.from({ length: 256 }, (_, index) => index);
  const shuffled = rng.shuffle(permutation);
  const table = [...shuffled, ...shuffled];

  return (x, y) => {
    const floorX = Math.floor(x) & 255;
    const floorY = Math.floor(y) & 255;
    const offsetX = x - Math.floor(x);
    const offsetY = y - Math.floor(y);
    const u = fade(offsetX);
    const v = fade(offsetY);

    const aa = table[table[floorX]! + floorY]!;
    const ab = table[table[floorX]! + floorY + 1]!;
    const ba = table[table[floorX + 1]! + floorY]!;
    const bb = table[table[floorX + 1]! + floorY + 1]!;

    const x1 = lerp(grad(aa, offsetX, offsetY), grad(ba, offsetX - 1, offsetY), u);
    const x2 = lerp(grad(ab, offsetX, offsetY - 1), grad(bb, offsetX - 1, offsetY - 1), u);
    return lerp(x1, x2, v);
  };
}

export function createFractalNoise2D(
  seed: number | string,
  options: Readonly<{
    octaves?: number;
    persistence?: number;
    lacunarity?: number;
  }> = {}
): (x: number, y: number) => number {
  const base = createPerlinNoise2D(seed);
  const octaves = Math.max(1, Math.floor(options.octaves ?? 4));
  const persistence = options.persistence ?? 0.5;
  const lacunarity = options.lacunarity ?? 2;

  return (x, y) => {
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    let weight = 0;

    for (let octave = 0; octave < octaves; octave += 1) {
      total += base(x * frequency + octave * 17.31, y * frequency + octave * 29.17) * amplitude;
      weight += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return weight === 0 ? 0 : total / weight;
  };
}
