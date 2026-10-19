export class SecurityChecksError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message)
    this.name = 'SecurityChecksError'
  }
}

export const notFound = (what = 'Not found'): SecurityChecksError => new SecurityChecksError(what, 404)
export const forbidden = (message = 'You do not have access to this'): SecurityChecksError => new SecurityChecksError(message, 403)
export const conflict = (message = 'This changed while you were working. Reload and try again.'): SecurityChecksError =>
  new SecurityChecksError(message, 409)
