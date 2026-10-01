import { Progress } from '@/components/ui/progress'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import type { EvaluateeProgress } from '@/lib/weekly/view-types'

export function WeeklyProgress({ progress }: { progress: EvaluateeProgress[] }) {
  if (progress.length === 0) return <p className="text-sm text-muted-foreground">You have nobody to evaluate this quarter.</p>
  return (
    <ul className="space-y-3">
      {progress.map((row) => (
        <li key={`${row.evaluatee.id}-${row.perspective}`} className="space-y-1">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>{row.evaluatee.name} <span className="text-muted-foreground">· {PERSPECTIVE_LABELS[row.perspective]}</span></span>
            <span className="text-muted-foreground">{row.answered} of {row.total} questions answered{row.satisfied > 0 ? ` · ${row.satisfied} accepted` : ''}</span>
          </div>
          <Progress value={row.total ? Math.round((row.answered / row.total) * 100) : 0} className="h-2" />
        </li>
      ))}
    </ul>
  )
}
