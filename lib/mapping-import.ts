import { HR_EVALUATORS } from '@/lib/config'

export const USER_NAME_ALIASES: Record<string, string> = {
  'fakaya jamil': 'Fakayha Jamil',
  'nohelia figuerdo': 'Nohelia Figueredo',
  'umair asmat': 'Omair Asmat',
}

export function normalizeImportedName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function resolveImportedName(name: string): string {
  const normalized = normalizeImportedName(name)
  return USER_NAME_ALIASES[normalized] || name.trim().replace(/\s+/g, ' ')
}

export function isHREvaluatorName(name: string): boolean {
  const normalized = normalizeImportedName(name)
  return HR_EVALUATORS.some((hr) => normalizeImportedName(hr) === normalized)
}
