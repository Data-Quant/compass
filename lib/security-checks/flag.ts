export function isSecurityChecksEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SECURITY_CHECKS_ENABLED === 'true'
}
