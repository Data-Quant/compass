export function ratingRequiresExplanation(ratingValue: number | null | undefined) {
  return ratingValue === 1 || ratingValue === 4
}

export function normalizeEvaluationTextResponse(
  textResponse: string | null | undefined
) {
  const trimmed = (textResponse || '').trim()
  return trimmed ? trimmed : null
}

export function isEvaluationResponseComplete(input: {
  questionType: string
  ratingValue?: number | null
  textResponse?: string | null
}) {
  if (input.questionType !== 'RATING') {
    return true
  }

  if (!input.ratingValue) {
    return false
  }

  if (!ratingRequiresExplanation(input.ratingValue)) {
    return true
  }

  return Boolean(normalizeEvaluationTextResponse(input.textResponse))
}
