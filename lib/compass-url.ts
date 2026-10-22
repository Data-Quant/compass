// Compass's address. Every link Compass sends people (emails, QR labels) is built on it, never on the address a
// request happened to come in on: that can be a preview deployment (compass-<hash>.vercel.app), which people must
// not be sent to. If Compass moves, change it here.
export const COMPASS_URL = 'https://compass-blond.vercel.app'

/** A section of Compass: `path` from "/" (with any query), e.g. compassUrl('/leave'). */
export function compassUrl(path = ''): string {
  if (path && !path.startsWith('/')) throw new Error(`Compass paths start with "/": ${path}`)
  return `${COMPASS_URL}${path}`
}
