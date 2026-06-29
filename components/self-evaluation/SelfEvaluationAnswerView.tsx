'use client'

import { GOAL_STATUS_LABELS, type GoalRow, type SelfEvaluationAnswer } from '@/lib/self-evaluation'

interface Props {
  answers: SelfEvaluationAnswer[]
}

/** Read-only renderer for a submitted self-evaluation's answers (snapshot array). */
export function SelfEvaluationAnswerView({ answers }: Props) {
  if (!answers || answers.length === 0) {
    return <p className="text-sm text-muted-foreground">No responses were provided.</p>
  }
  return (
    <div className="space-y-5">
      {answers.map((answer) => (
        <div key={answer.questionId}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {answer.section}
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{answer.prompt}</p>
          <div className="mt-2 text-sm text-foreground">{renderValue(answer)}</div>
        </div>
      ))}
    </div>
  )
}

function renderValue(answer: SelfEvaluationAnswer) {
  if (answer.type === 'TEXT') {
    const text = (answer.value as string) || ''
    return text.trim() ? (
      <p className="whitespace-pre-wrap">{text}</p>
    ) : (
      <span className="text-muted-foreground">—</span>
    )
  }

  if (answer.type === 'LIST') {
    const items = (answer.value as string[]) || []
    return items.length ? (
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i} className="whitespace-pre-wrap">
            {item}
          </li>
        ))}
      </ul>
    ) : (
      <span className="text-muted-foreground">—</span>
    )
  }

  const rows = (answer.value as GoalRow[]) || []
  if (!rows.length) return <span className="text-muted-foreground">—</span>
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Goal</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 font-medium">Comments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 align-top">
              <td className="py-2 pr-3 whitespace-pre-wrap">{row.goal || '—'}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{GOAL_STATUS_LABELS[row.status] || row.status}</td>
              <td className="py-2 whitespace-pre-wrap">{row.comments || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
