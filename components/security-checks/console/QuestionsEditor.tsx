'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CampaignFields } from '@/lib/security-checks/schemas'
import { QUESTION_TYPES, type QuestionType } from '@/lib/security-checks/types'

type Question = CampaignFields['questions'][number]

const TYPE_LABELS: Record<QuestionType, string> = {
  YES_NO: 'Yes / No',
  ACCOUNT_IDENTIFIER: 'Account identifier',
  SHORT_TEXT: 'Short text',
}

export const selectClass =
  'h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

interface QuestionsEditorProps {
  questions: Question[]
  disabled: boolean
  onChange: (questions: Question[]) => void
}

export function QuestionsEditor({ questions, disabled, onChange }: QuestionsEditorProps) {
  const update = (index: number, patch: Partial<Question>) => onChange(questions.map((question, i) => (i === index ? { ...question, ...patch } : question)))
  return (
    <div className="space-y-3">
      {questions.length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
      {questions.map((question, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
          <select
            aria-label="Question type"
            className={selectClass}
            value={question.type}
            disabled={disabled}
            onChange={(event) => {
              const type = event.target.value as QuestionType
              update(index, { type, compliantAnswer: type === 'YES_NO' ? true : null })
            }}
          >
            {QUESTION_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
          </select>
          <Input
            aria-label="Question prompt"
            className="min-w-[220px] flex-1"
            value={question.prompt}
            maxLength={500}
            disabled={disabled}
            placeholder="e.g. Is MFA enabled on this account?"
            onChange={(event) => update(index, { prompt: event.target.value })}
          />
          {question.type === 'YES_NO' && (
            <select
              aria-label="Compliant answer"
              className={selectClass}
              value={question.compliantAnswer === false ? 'no' : 'yes'}
              disabled={disabled}
              onChange={(event) => update(index, { compliantAnswer: event.target.value === 'yes' })}
            >
              <option value="yes">Compliant answer: Yes</option>
              <option value="no">Compliant answer: No</option>
            </select>
          )}
          <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label="Remove question" onClick={() => onChange(questions.filter((_, i) => i !== index))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || questions.length >= 30}
        onClick={() => onChange([...questions, { type: 'YES_NO', prompt: '', compliantAnswer: true }])}
      >
        <Plus className="mr-2 h-4 w-4" /> Add question
      </Button>
    </div>
  )
}
