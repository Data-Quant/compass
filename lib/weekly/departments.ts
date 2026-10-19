// Department topics are asked about people in their departments (UX spec, section 9). Names are compared loosely, so
// "Growth & Strategy", "growth and strategy" and "Growth and  Strategy" are the same department.
const normalise = (name: string): string => name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()

export function sameDepartment(a: string, b: string | null): boolean {
  return b !== null && normalise(a) === normalise(b)
}
