'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  GOAL_STATUSES,
  GOAL_STATUS_LABELS,
  type GoalRow,
  type GoalStatus,
  type SelfEvaluationQuestionType,
} from '@/lib/self-evaluation'
import { Plus, Trash2 } from 'lucide-react'

export interface SelfEvalQuestion {
  id: string
  section: string
  prompt: string
  helpText?: string | null
  type: SelfEvaluationQuestionType
}

export type ResponseValue = string | string[] | GoalRow[]

interface Props {
  questions: SelfEvalQuestion[]
  responses: Record<string, ResponseValue>
  onChange: (questionId: string, value: ResponseValue) => void
  disabled?: boolean
}

export function SelfEvaluationForm({ questions, responses, onChange, disabled }: Props) {
  return (
    <div className="space-y-6">
      {questions.map((q, index) => (
        <div key={q.id} className="rounded-card border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-semibold">
              {index + 1}
            </span>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {q.section}
              </p>
              <h3 className="mt-0.5 text-base font-medium text-foreground">{q.prompt}</h3>
              {q.helpText ? (
                <p className="mt-1 text-sm text-muted-foreground">{q.helpText}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-4 sm:ml-11">{renderField(q, responses[q.id], onChange, disabled)}</div>
        </div>
      ))}
    </div>
  )
}

function renderField(
  q: SelfEvalQuestion,
  value: ResponseValue | undefined,
  onChange: Props['onChange'],
  disabled?: boolean,
) {
  if (q.type === 'TEXT') {
    return (
      <Textarea
        value={(value as string) || ''}
        onChange={(e) => onChange(q.id, e.target.value)}
        disabled={disabled}
        rows={4}
        placeholder="Your response..."
      />
    )
  }

  if (q.type === 'LIST') {
    const items = ((value as string[]) || ['']).length ? (value as string[]) : ['']
    const update = (next: string[]) => onChange(q.id, next)
    return (
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-5 text-right">{i + 1}.</span>
            <Input
              value={item}
              onChange={(e) => update(items.map((it, j) => (j === i ? e.target.value : it)))}
              disabled={disabled}
              placeholder="Add an item..."
            />
            {!disabled && items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => update(items.filter((_, j) => j !== i))}
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        ))}
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={() => update([...items, ''])}>
            <Plus className="w-4 h-4" /> Add item
          </Button>
        )}
      </div>
    )
  }

  // GOAL_TABLE
  const emptyRow: GoalRow = { goal: '', status: 'NOT_STARTED', comments: '' }
  const rows = ((value as GoalRow[]) || [emptyRow]).length ? (value as GoalRow[]) : [emptyRow]
  const update = (next: GoalRow[]) => onChange(q.id, next)
  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_170px_1fr_auto] sm:items-center">
          <Input
            value={row.goal}
            onChange={(e) => update(rows.map((r, j) => (j === i ? { ...r, goal: e.target.value } : r)))}
            disabled={disabled}
            placeholder="Goal"
          />
          <Select
            value={row.status}
            onValueChange={(v) =>
              update(rows.map((r, j) => (j === i ? { ...r, status: v as GoalStatus } : r)))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GOAL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {GOAL_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={row.comments}
            onChange={(e) => update(rows.map((r, j) => (j === i ? { ...r, comments: e.target.value } : r)))}
            disabled={disabled}
            placeholder="Comments"
          />
          {!disabled && rows.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => update(rows.filter((_, j) => j !== i))}
            >
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => update([...rows, { ...emptyRow }])}>
          <Plus className="w-4 h-4" /> Add goal
        </Button>
      )}
    </div>
  )
}
