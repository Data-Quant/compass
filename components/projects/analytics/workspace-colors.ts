import { CATEGORICAL, NEUTRAL } from './chart-theme'

export const MAX_SERIES = 6
export const OTHER_KEY = 'other'
// OKLab distance x100. Below the dataviz normal-vision floor, two marks read as one colour.
const MIN_DISTANCE = 15

type Lab = [number, number, number]

function hexToOklab(hex: string): Lab | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null
  const linear = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const [r, g, b] = linear
  const l = Math.cbrt(0.4122214708 * r + 0.5363434177 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const distance = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100

/** True when every colour is a valid hex and each pair clears the normal-vision floor. */
export function colorsAreDistinct(colors: Array<string | null>) {
  const labs = colors.map((color) => (color ? hexToOklab(color) : null))
  if (labs.some((lab) => lab === null)) return false
  return labs.every((lab, i) => labs.slice(i + 1).every((other) => distance(lab!, other!) >= MIN_DISTANCE))
}

export type SeriesProject = { projectId: string; name: string; color: string | null; completed: number }

/**
 * Colour per project for the workspace charts and table.
 * Keeps the six busiest projects (completed in range, ties by name); the rest fold into "Other".
 * Uses the projects' own colours when they are all set and distinguishable; otherwise the
 * validated categorical palette, in name order, for all of them.
 */
export function assignProjectColors(projects: SeriesProject[]) {
  const kept = [...projects]
    .sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name))
    .slice(0, MAX_SERIES)
    .sort((a, b) => a.name.localeCompare(b.name))
  const own = colorsAreDistinct(kept.map((project) => project.color))
  const colors = new Map<string, string>(kept.map((project, i) => [project.projectId, own ? project.color! : CATEGORICAL[i]]))
  return {
    /** Kept projects in legend order, then "Other" when anything folded. */
    series: [
      ...kept.map((project) => ({ key: project.projectId, label: project.name, color: colors.get(project.projectId)! })),
      ...(projects.length > kept.length ? [{ key: OTHER_KEY, label: 'Other projects', color: NEUTRAL }] : []),
    ],
    keyOf: (projectId: string) => (colors.has(projectId) ? projectId : OTHER_KEY),
    colorOf: (projectId: string) => colors.get(projectId) ?? NEUTRAL,
  }
}
