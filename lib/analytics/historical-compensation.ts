export type CompensationEventType =
  | 'PROMOTION'
  | 'ROLE_CHANGE'
  | 'PAY_INCREASE'
  | 'PAY_DECREASE'
  | 'BONUS_INCREASE'
  | 'BONUS_DECREASE'
  | 'COMPENSATION_REVISION'

export type CompensationEventSource = 'PAYROLL' | 'SALARY_REVISION'

export interface CompensationReceiptObservation {
  id: string
  periodId: string
  periodName: string
  effectiveFrom: string
  currency: string
  receiptJson: unknown
}

export interface CompensationRevisionObservation {
  id: string
  effectiveFrom: string
  note: string | null
  lines: Array<{
    componentKey: string
    componentName: string
    amount: number
  }>
}

export interface HistoricalCompensationPoint {
  id: string
  periodId: string
  periodName: string
  effectiveFrom: string
  currency: string
  baseSalary: number
  bonus: number
  totalCash: number
}

export interface HistoricalCompensationEvent {
  id: string
  effectiveFrom: string
  type: CompensationEventType
  title: string
  detail: string | null
  currency: string | null
  previousAmount: number | null
  amount: number | null
  delta: number | null
  anchorAmount: number | null
  source: CompensationEventSource
}

export interface HistoricalCompensationSeries {
  currencies: string[]
  points: HistoricalCompensationPoint[]
  events: HistoricalCompensationEvent[]
}

export interface HistoricalCompensationEmployee extends HistoricalCompensationSeries {
  id: string
  name: string
  department: string | null
  position: string | null
  isPayrollActive: boolean
}

export interface HistoricalCompensationPayload {
  generatedAt: string
  summary: {
    employeeCount: number
    employeesWithHistory: number
    eventCount: number
    currencies: string[]
  }
  employees: HistoricalCompensationEmployee[]
}

export interface HistoricalCompensationEventMarker {
  employeeId: string
  employeeName: string
  timestamp: number
  anchorAmount: number
  events: HistoricalCompensationEvent[]
}

/**
 * Groups every chartable event without truncating the employee's history.
 * Events that share a payroll point become one marker with a multi-event
 * tooltip so pay and bonus changes on the same date do not hide each other.
 */
export function buildHistoricalCompensationEventMarkers(
  employees: ReadonlyArray<Pick<HistoricalCompensationEmployee, 'id' | 'name' | 'events'>>,
  currency: string
): HistoricalCompensationEventMarker[] {
  const markers = new Map<string, HistoricalCompensationEventMarker>()

  for (const employee of employees) {
    for (const event of employee.events) {
      if (event.currency && event.currency !== currency) continue
      if (event.anchorAmount === null || !Number.isFinite(event.anchorAmount)) continue

      const timestamp = new Date(event.effectiveFrom).getTime()
      if (!Number.isFinite(timestamp)) continue

      const key = `${employee.id}:${timestamp}:${event.anchorAmount}`
      const marker = markers.get(key)
      if (marker) marker.events.push(event)
      else {
        markers.set(key, {
          employeeId: employee.id,
          employeeName: employee.name,
          timestamp,
          anchorAmount: event.anchorAmount,
          events: [event],
        })
      }
    }
  }

  return [...markers.values()].sort(
    (a, b) => a.timestamp - b.timestamp || a.employeeName.localeCompare(b.employeeName)
  )
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function earningsFrom(receiptJson: unknown): Record<string, unknown> | null {
  if (!receiptJson || typeof receiptJson !== 'object') return null
  const earnings = (receiptJson as { earnings?: unknown }).earnings
  return earnings && typeof earnings === 'object'
    ? (earnings as Record<string, unknown>)
    : null
}

export function classifyCompensationRevision(note: string | null | undefined):
  | 'PROMOTION'
  | 'ROLE_CHANGE'
  | 'COMPENSATION_REVISION' {
  const normalized = note?.trim().toLowerCase() || ''
  if (/\bpromot(?:e|ed|ion|ing)\b/.test(normalized)) return 'PROMOTION'
  if (/\b(role|title|designation|position)\b/.test(normalized)) return 'ROLE_CHANGE'
  return 'COMPENSATION_REVISION'
}

function revisionTitle(type: ReturnType<typeof classifyCompensationRevision>): string {
  if (type === 'PROMOTION') return 'Promotion'
  if (type === 'ROLE_CHANGE') return 'Role change'
  return 'Compensation revision'
}

function pointAtOrBefore(
  points: readonly HistoricalCompensationPoint[],
  date: string
): HistoricalCompensationPoint | null {
  const target = new Date(date).getTime()
  if (!Number.isFinite(target)) return null

  let match: HistoricalCompensationPoint | null = null
  for (const point of points) {
    if (new Date(point.effectiveFrom).getTime() <= target) match = point
    else break
  }
  return match ?? points[0] ?? null
}

function inferredChangeEvent(args: {
  current: HistoricalCompensationPoint
  previous: HistoricalCompensationPoint
  component: 'baseSalary' | 'bonus'
}): HistoricalCompensationEvent | null {
  const { current, previous, component } = args
  const amount = current[component]
  const previousAmount = previous[component]
  if (amount === previousAmount) return null

  const increasing = amount > previousAmount
  const isBonus = component === 'bonus'
  const type: CompensationEventType = isBonus
    ? increasing
      ? 'BONUS_INCREASE'
      : 'BONUS_DECREASE'
    : increasing
      ? 'PAY_INCREASE'
      : 'PAY_DECREASE'

  return {
    id: `${current.id}:${component}`,
    effectiveFrom: current.effectiveFrom,
    type,
    title: isBonus
      ? increasing
        ? 'Bonus increased'
        : 'Bonus decreased'
      : increasing
        ? 'Pay bump'
        : 'Base pay decreased',
    detail: `${previous.periodName} to ${current.periodName}`,
    currency: current.currency,
    previousAmount,
    amount,
    delta: amount - previousAmount,
    anchorAmount: current.baseSalary,
    source: 'PAYROLL',
  }
}

/**
 * Builds an employee's chart-ready history from finalized payroll receipts and
 * explicit salary revisions. Currency streams never compare against each other.
 */
export function buildHistoricalCompensationSeries(args: {
  receipts: readonly CompensationReceiptObservation[]
  revisions?: readonly CompensationRevisionObservation[]
}): HistoricalCompensationSeries {
  const points = args.receipts
    .map((receipt): HistoricalCompensationPoint | null => {
      const earnings = earningsFrom(receipt.receiptJson)
      const baseSalary = earnings ? finiteNumber(earnings.basicSalary) : null
      if (baseSalary === null || baseSalary <= 0) return null

      const bonus = earnings ? finiteNumber(earnings.bonus) ?? 0 : 0
      const currency = receipt.currency.trim().toUpperCase()
      const timestamp = new Date(receipt.effectiveFrom).getTime()
      if (!currency || !Number.isFinite(timestamp)) return null

      return {
        id: receipt.id,
        periodId: receipt.periodId,
        periodName: receipt.periodName,
        effectiveFrom: new Date(timestamp).toISOString(),
        currency,
        baseSalary,
        bonus,
        totalCash: baseSalary + bonus,
      }
    })
    .filter((point): point is HistoricalCompensationPoint => point !== null)
    .sort(
      (a, b) =>
        new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime() ||
        a.id.localeCompare(b.id)
    )

  const events: HistoricalCompensationEvent[] = []
  const previousByCurrency = new Map<string, HistoricalCompensationPoint>()
  for (const point of points) {
    const previous = previousByCurrency.get(point.currency)
    if (previous) {
      const payEvent = inferredChangeEvent({ current: point, previous, component: 'baseSalary' })
      const bonusEvent = inferredChangeEvent({ current: point, previous, component: 'bonus' })
      if (payEvent) events.push(payEvent)
      if (bonusEvent) events.push(bonusEvent)
    }
    previousByCurrency.set(point.currency, point)
  }

  for (const revision of args.revisions ?? []) {
    const timestamp = new Date(revision.effectiveFrom).getTime()
    if (!Number.isFinite(timestamp)) continue

    const type = classifyCompensationRevision(revision.note)
    const baseLine = revision.lines.find(
      (line) => line.componentKey.trim().toUpperCase() === 'BASIC_SALARY'
    )
    const nearbyPoint = pointAtOrBefore(points, revision.effectiveFrom)

    events.push({
      id: revision.id,
      effectiveFrom: new Date(timestamp).toISOString(),
      type,
      title: revisionTitle(type),
      detail: revision.note?.trim() || null,
      currency: nearbyPoint?.currency ?? null,
      previousAmount: null,
      amount: baseLine && Number.isFinite(baseLine.amount) ? baseLine.amount : null,
      delta: null,
      anchorAmount:
        baseLine && Number.isFinite(baseLine.amount)
          ? baseLine.amount
          : nearbyPoint?.baseSalary ?? null,
      source: 'SALARY_REVISION',
    })
  }

  events.sort(
    (a, b) =>
      new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime() ||
      a.id.localeCompare(b.id)
  )

  return {
    currencies: [...new Set(points.map((point) => point.currency))].sort(),
    points,
    events,
  }
}
