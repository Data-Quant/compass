import { timingSafeEqual } from 'node:crypto'

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`. */
export function isCronAuthorized(
  authorization: string | null,
  secret: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!secret || !authorization) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const supplied = Buffer.from(authorization)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
