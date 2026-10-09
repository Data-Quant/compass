/** FNV-1a: a small, stable, non-cryptographic hash for sampling and test fixtures. */
export function stableHash(seed: string): number {
  let value = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    value ^= seed.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

/**
 * For random orders: FNV-1a followed by MurmurHash3's final mix. FNV-1a alone barely changes when only the last
 * character differs (o1, o2 … o8), so sorting by it kept options close to their original, score order.
 */
export function shuffleHash(seed: string): number {
  let h = stableHash(seed)
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
