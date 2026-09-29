export const COPY_THRESHOLD = 0.8

function trigrams(text: string): Set<string> {
  const normalized = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
  const grams = new Set<string>()
  for (let i = 0; i + 3 <= normalized.length; i += 1) grams.add(normalized.slice(i, i + 3))
  return grams
}

/** Jaccard similarity of character trigrams, 0–1. */
export function trigramSimilarity(a: string, b: string): number {
  if (!a.trim() || !b.trim()) return 0
  const x = trigrams(a)
  const y = trigrams(b)
  let shared = 0
  for (const gram of x) if (y.has(gram)) shared += 1
  return shared / (x.size + y.size - shared)
}

export function isNearDuplicate(a: string, b: string): boolean {
  return trigramSimilarity(a, b) >= COPY_THRESHOLD
}
