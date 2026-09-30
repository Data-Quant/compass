// Spec 10: accepted weekly scores become ordinary Evaluation rows, one per evaluator, person and question.
export interface ConfirmedScore { evaluatorId: string; evaluateeId: string; questionId: string | null; leadQuestionId: string | null; score: number }
export interface CommentAnswer { evaluatorId: string; evaluateeId: string; questionId: string; text: string }
export interface AggregateRow {
  evaluatorId: string
  evaluateeId: string
  questionId: string | null
  leadQuestionId: string | null
  ratingValue: number | null
  textResponse: string | null
}
export interface AggregationCounts {
  ratingRows: number
  commentRows: number
  evaluatees: number
  /** Accepted scores whose topic no longer points at a question (the question was deleted). */
  skippedNoQuestion: number
  /** People who left before close: no PE score. */
  excludedEvaluatees: number
  /** Spec 13.3: evaluator–person pairs with classic answers in the weekly banks; their weekly evidence was not written. */
  skippedManualPairs: number
  /** Unsubmitted classic drafts removed because a weekly row took their question (the service fills this in). */
  clearedClassicDrafts: number
}

const rowKey = (r: { evaluatorId: string; evaluateeId: string; questionId: string | null; leadQuestionId: string | null }) =>
  `${r.evaluatorId}|${r.evaluateeId}|${r.questionId ?? ''}|${r.leadQuestionId ?? ''}`
export const pairKey = (entry: { evaluatorId: string; evaluateeId: string }): string => `${entry.evaluatorId}|${entry.evaluateeId}`

export function buildAggregateRows(input: {
  scores: readonly ConfirmedScore[]
  comments: readonly CommentAnswer[]
  excludedEvaluateeIds: ReadonlySet<string>
  /** pairKey()s of the pairs that keep their classic rows. */
  manualPairs: ReadonlySet<string>
}): { rows: AggregateRow[]; counts: AggregationCounts } {
  const excluded = new Set<string>()
  const skippedPairs = new Set<string>()
  let skippedNoQuestion = 0
  /** Leavers and pairs with classic answers are left out. */
  const keep = (entry: { evaluatorId: string; evaluateeId: string }): boolean => {
    if (input.excludedEvaluateeIds.has(entry.evaluateeId)) {
      excluded.add(entry.evaluateeId)
      return false
    }
    if (input.manualPairs.has(pairKey(entry))) {
      skippedPairs.add(pairKey(entry))
      return false
    }
    return true
  }
  const ratingGroups = new Map<string, { base: ConfirmedScore; total: number; count: number }>()
  for (const score of input.scores) {
    if (!keep(score)) continue
    if (!score.questionId && !score.leadQuestionId) {
      skippedNoQuestion += 1
      continue
    }
    const key = rowKey(score)
    const group = ratingGroups.get(key) ?? { base: score, total: 0, count: 0 }
    ratingGroups.set(key, { ...group, total: group.total + score.score, count: group.count + 1 })
  }
  const commentGroups = new Map<string, { base: CommentAnswer; texts: string[] }>()
  for (const comment of input.comments) {
    if (!keep(comment)) continue
    const text = comment.text.trim()
    if (!text) continue
    const key = rowKey({ ...comment, leadQuestionId: null })
    const group = commentGroups.get(key) ?? { base: comment, texts: [] }
    commentGroups.set(key, { ...group, texts: [...group.texts, text] })
  }
  const ratingRows: AggregateRow[] = [...ratingGroups.values()].map(({ base, total, count }) => ({
    evaluatorId: base.evaluatorId, evaluateeId: base.evaluateeId, questionId: base.questionId, leadQuestionId: base.leadQuestionId,
    ratingValue: total / count, textResponse: null,
  }))
  const commentRows: AggregateRow[] = [...commentGroups.values()].map(({ base, texts }) => ({
    evaluatorId: base.evaluatorId, evaluateeId: base.evaluateeId, questionId: base.questionId, leadQuestionId: null,
    ratingValue: null, textResponse: texts.join('\n\n'),
  }))
  const rows = [...ratingRows, ...commentRows]
  return {
    rows,
    counts: {
      ratingRows: ratingRows.length, commentRows: commentRows.length, evaluatees: new Set(rows.map((r) => r.evaluateeId)).size,
      skippedNoQuestion, excludedEvaluatees: excluded.size, skippedManualPairs: skippedPairs.size, clearedClassicDrafts: 0,
    },
  }
}
