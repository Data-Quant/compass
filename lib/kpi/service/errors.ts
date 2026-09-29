export class KpiError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message)
    this.name = 'KpiError'
  }
}
