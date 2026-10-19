import type { HistoryEntry } from '@/lib/security-checks/service/task-views'
import { formatDateTime } from './format'

interface HistoryListProps {
  entries: HistoryEntry[]
  /** Console viewers see who acted; employees see "Security team". */
  names?: Record<string, string>
}

export function HistoryList({ entries, names }: HistoryListProps) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>
  return (
    <ol className="space-y-3">
      {entries.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className="flex gap-3 text-sm">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
          <div className="min-w-0">
            <p className="text-foreground">
              <span className="font-medium">{entry.label}</span>
              {entry.subtaskName && <span className="text-muted-foreground"> · {entry.subtaskName}</span>}
              {entry.selfReview && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">self-review</span>}
            </p>
            {entry.reason && <p className="whitespace-pre-wrap text-muted-foreground">{entry.reason}</p>}
            <p className="text-xs text-muted-foreground">
              {formatDateTime(entry.at)}
              {entry.kind === 'REVIEW' && ` · ${names && entry.actorId ? (names[entry.actorId] ?? 'Unknown') : 'Security team'}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
