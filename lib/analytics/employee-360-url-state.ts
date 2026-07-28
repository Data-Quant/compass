export const EMPLOYEE_360_DOMAINS = [
  'overview',
  'evaluation',
  'clients',
  'compensation',
  'timeline',
] as const

export type Employee360Domain = (typeof EMPLOYEE_360_DOMAINS)[number]

export interface Employee360UrlState {
  employeeId: string | null
  periodId: string | null
  compareId: string | null
  domain: Employee360Domain
}

export function parseEmployee360Domain(value: string | null): Employee360Domain {
  return EMPLOYEE_360_DOMAINS.includes(value as Employee360Domain)
    ? (value as Employee360Domain)
    : 'overview'
}

export function parseEmployee360UrlState(
  searchParams: Pick<URLSearchParams, 'get'>
): Employee360UrlState {
  const employeeId = searchParams.get('employeeId')
  const rawCompareId = searchParams.get('compareId')
  return {
    employeeId,
    periodId: searchParams.get('periodId'),
    compareId: rawCompareId && rawCompareId !== employeeId ? rawCompareId : null,
    domain: parseEmployee360Domain(searchParams.get('domain')),
  }
}

export function updateEmployee360SearchParams(
  current: Pick<URLSearchParams, 'toString'>,
  changes: Partial<Record<keyof Employee360UrlState, string | null>>
): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value)
    else next.delete(key)
  }

  const employeeId = next.get('employeeId')
  if (employeeId && next.get('compareId') === employeeId) {
    next.delete('compareId')
  }

  const domain = next.get('domain')
  if (domain && !EMPLOYEE_360_DOMAINS.includes(domain as Employee360Domain)) {
    next.set('domain', 'overview')
  }

  return next
}
