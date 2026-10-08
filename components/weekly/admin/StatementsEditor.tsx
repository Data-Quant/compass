'use client'

// A question's 8 statements and their scores (UX spec, section 8). HR sees them in score order; evaluators see them
// shuffled, without scores.
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MCQ_LEVELS, MCQ_OPTION_COUNT, optionsProblem, type McqStatement } from '@/lib/weekly/mcq'

/** A blank question: one statement per level, plus the repeat at 2.5 for HR to reword. */
export const BLANK_STATEMENTS: McqStatement[] = [...MCQ_LEVELS, 2.5].sort((a, b) => a - b).map((score) => ({ text: '', score }))

export function statementsProblem(statements: readonly McqStatement[]): string | null {
  return optionsProblem(statements)
}

interface Props { statements: McqStatement[]; onChange: (next: McqStatement[]) => void; disabled?: boolean; label: string }

export function StatementsEditor({ statements, onChange, disabled, label }: Props) {
  const set = (index: number, patch: Partial<McqStatement>) => onChange(statements.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  const problem = optionsProblem(statements)
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {MCQ_OPTION_COUNT} statements, one per score from 1 to 4 in half points, with one level repeated in other words. Evaluators see them shuffled and never see the scores.
      </p>
      <ul className="space-y-1.5">
        {statements.map((statement, index) => (
          <li key={index} className="flex items-center gap-2">
            <Select value={String(statement.score)} disabled={disabled} onValueChange={(v) => set(index, { score: Number(v) })}>
              <SelectTrigger className="h-8 w-20 shrink-0" aria-label={`${label}: score of statement ${index + 1}`}><SelectValue /></SelectTrigger>
              <SelectContent>{MCQ_LEVELS.map((level) => <SelectItem key={level} value={String(level)}>{level}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="h-8" value={statement.text} maxLength={300} disabled={disabled} aria-label={`${label}: statement ${index + 1}`} onChange={(e) => set(index, { text: e.target.value })} />
          </li>
        ))}
      </ul>
      {problem && <p className="text-xs text-amber-700 dark:text-amber-400">{problem}</p>}
    </div>
  )
}
