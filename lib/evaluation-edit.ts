/**
 * Rules for HR corrections to submitted evaluations.
 *
 * Once submitted, an evaluation is locked for its own author, so HR is the only
 * route to fixing a mis-click. That makes this a correction tool, not a way to
 * revise someone's opinion, and the rules below keep it that way.
 */

export type EvaluationEditTarget = {
  ratingValue: number | null
  textResponse: string | null
  periodId: string
  submittedAt: Date | null
}

export type EvaluationEditInput = {
  ratingValue?: number | null
  textResponse?: string | null
}

export const MIN_RATING = 1
export const MAX_RATING = 4

export type EditRejection = { ok: false; reason: string }
export type EditApproval = { ok: true }
export type EditDecision = EditRejection | EditApproval

/**
 * Corrections are limited to the active period. A closed period has already
 * produced reports that employees read and were reviewed against, so changing one
 * would rewrite history they have already been shown.
 */
export function canEditInPeriod(target: { periodId: string }, activePeriodId: string | null): EditDecision {
  if (!activePeriodId) {
    return { ok: false, reason: 'There is no active evaluation period' }
  }

  if (target.periodId !== activePeriodId) {
    return { ok: false, reason: 'Only evaluations in the active period can be corrected' }
  }

  return { ok: true }
}

/** Ratings stay on the 1-4 scale the questions are written against. */
export function validateRating(value: number | null | undefined): EditDecision {
  if (value === null || value === undefined) {
    return { ok: true }
  }

  if (!Number.isFinite(value)) {
    return { ok: false, reason: 'Rating must be a number' }
  }

  if (!Number.isInteger(value)) {
    return { ok: false, reason: 'Rating must be a whole number' }
  }

  if (value < MIN_RATING || value > MAX_RATING) {
    return { ok: false, reason: `Rating must be between ${MIN_RATING} and ${MAX_RATING}` }
  }

  return { ok: true }
}

/**
 * An edit has to change something. Without this a no-op write would still append
 * an audit row, filling the history with entries that record nothing.
 */
export function hasActualChange(
  target: Pick<EvaluationEditTarget, 'ratingValue' | 'textResponse'>,
  input: EvaluationEditInput
): boolean {
  const ratingChanged =
    input.ratingValue !== undefined && (input.ratingValue ?? null) !== (target.ratingValue ?? null)

  const nextText = input.textResponse === undefined ? undefined : input.textResponse?.trim() || null
  const textChanged = nextText !== undefined && nextText !== (target.textResponse?.trim() || null)

  return ratingChanged || textChanged
}

/** The values to persist, leaving untouched fields alone. */
export function applyEdit(target: EvaluationEditTarget, input: EvaluationEditInput) {
  return {
    ratingValue: input.ratingValue === undefined ? target.ratingValue : input.ratingValue,
    textResponse:
      input.textResponse === undefined ? target.textResponse : input.textResponse?.trim() || null,
  }
}

/** Full gate, so the route cannot apply the checks in the wrong order. */
export function decideEdit(params: {
  target: EvaluationEditTarget
  input: EvaluationEditInput
  activePeriodId: string | null
}): EditDecision {
  const periodDecision = canEditInPeriod(params.target, params.activePeriodId)
  if (!periodDecision.ok) return periodDecision

  const ratingDecision = validateRating(params.input.ratingValue)
  if (!ratingDecision.ok) return ratingDecision

  if (!hasActualChange(params.target, params.input)) {
    return { ok: false, reason: 'Nothing changed' }
  }

  return { ok: true }
}
