function toSeed(seed: number | string): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return seed >>> 0;
  }

  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let current = seed >>> 0;

  return () => {
    current = (current + 0x6d2b79f5) >>> 0;
    let value = current;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export type DeterministicRng = Readonly<{
  next: () => number;
  float: (min?: number, max?: number) => number;
  int: (min: number, max: number) => number;
  pick: <Value>(values: readonly Value[]) => Value;
  shuffle: <Value>(values: readonly Value[]) => Value[];
}>;

export function createRng(seed: number | string): DeterministicRng {
  const next = mulberry32(toSeed(seed));

  return {
    next,
    float(min = 0, max = 1) {
      return min + (max - min) * next();
    },
    int(min, max) {
      return Math.floor(min + (max - min + 1) * next());
    },
    pick<Value>(values: readonly Value[]): Value {
      if (values.length === 0) {
        throw new Error("Cannot pick from an empty array.");
      }

      return values[Math.floor(next() * values.length)] as Value;
    },
    shuffle<Value>(values: readonly Value[]): Value[] {
      const copy = [...values];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(next() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
      }
      return copy;
    },
  };
}
