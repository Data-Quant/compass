/** FNV-1a: a small, stable, non-cryptographic hash for sampling and test fixtures. */
export function stableHash(seed: string): number {
  let value = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    value ^= seed.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}
