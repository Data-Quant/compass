// Paths that must work without a session cookie. Kept out of middleware.ts so
// the rule is unit-testable.
export const PUBLIC_PATHS: readonly string[] = [
  '/login',
  '/api/auth/login',
  '/api/auth/csrf',
  '/api/csp-report',
  '/_next',
  '/favicon.ico',
  '/images',
  // One-click peer approvals from email: the unguessable token in the link is the credential.
  '/peer-requests/',
  '/api/peer-requests/',
]

// Vercel cron requests carry no session cookie. Every route under this prefix
// must authenticate the request itself with isCronAuthorized (lib/cron-auth.ts).
export const CRON_PATH_PREFIX = '/api/cron/'

export function bypassesSessionCheck(pathname: string): boolean {
  return pathname.startsWith(CRON_PATH_PREFIX) || PUBLIC_PATHS.some((path) => pathname.startsWith(path))
}
