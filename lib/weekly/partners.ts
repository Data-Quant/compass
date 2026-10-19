// Partners whose evaluations HR fills in on their behalf: they get no weekly questions and see no forms; every
// evaluation mapped to them appears in HR's "Partner evaluations" table instead. Brad and Maryam stay as they are.
const DEFAULT_PARTNERS = ['Hamiz Awan', 'Daniyal Awan']

const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

/** WEEKLY_HR_FILLED_PARTNERS (comma-separated names) overrides the default list. */
export function hrFilledPartnerNames(): string[] {
  const configured = process.env.WEEKLY_HR_FILLED_PARTNERS
  return configured === undefined ? DEFAULT_PARTNERS : configured.split(',').map((n) => n.trim()).filter(Boolean)
}

export function isHrFilledPartner(name: string | null | undefined): boolean {
  if (!name) return false
  const wanted = normalize(name)
  return hrFilledPartnerNames().some((partner) => normalize(partner) === wanted)
}
