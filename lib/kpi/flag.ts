export function isKpiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.KPI_ENABLED === 'true'
}
