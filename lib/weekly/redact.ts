const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Replaces each person's full name, then each part of it with 3 or more letters, by a placeholder.
 * Whole words only, any case; longest names first so "Ana Torvik" wins over "Ana".
 */
export function redactNames(text: string, people: ReadonlyArray<{ name: string; placeholder: string }>): string {
  const replacements = people
    .flatMap(({ name, placeholder }) => {
      const full = name.trim()
      const parts = full.split(/\s+/).filter((part) => part.length >= 3)
      return [full, ...parts].filter(Boolean).map((needle) => ({ needle, placeholder }))
    })
    .sort((a, b) => b.needle.length - a.needle.length)
  return replacements.reduce(
    (current, { needle, placeholder }) => current.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, 'giu'), placeholder),
    text,
  )
}
