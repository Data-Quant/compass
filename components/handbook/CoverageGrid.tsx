'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import type { CoverageRow } from '@/lib/handbook/coverage'

const SHORT_LABELS: Record<string, string> = {
  PAKISTAN: 'PK',
  MOROCCO: 'MA',
  COLOMBIA: 'CO',
  INDONESIA: 'ID',
  NOBLE: 'NB',
  THREE_E_PAKISTAN: '3E PK',
  THREE_E_MOROCCO: '3E MA',
}

export function CoverageGrid({ rows }: { rows: CoverageRow[] }) {
  return (
    // Wide content scrolls inside its own container -- the page body must never
    // scroll horizontally.
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left font-medium text-foreground bg-muted/50 px-3 py-2 border-b border-border">
              Page
            </th>
            {ALL_TEAMS.map((team) => (
              <th
                key={team}
                title={TEAM_LABELS[team]}
                className="font-medium text-muted-foreground bg-muted/50 px-2 py-2 border-b border-border text-center whitespace-nowrap"
              >
                {SHORT_LABELS[team]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.pageId} className="hover:bg-muted/40 transition-colors">
              <td className="px-3 py-2 border-b border-border">
                <Link
                  href={`/admin/handbook/${row.pageId}`}
                  className="text-foreground hover:text-primary transition-colors"
                >
                  {row.title}
                </Link>
                {!row.isPublished && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Draft
                  </span>
                )}
              </td>
              {row.cells.map((cell) => (
                <td key={cell.team} className="px-2 py-2 border-b border-border text-center">
                  <Link
                    href={`/admin/handbook/${row.pageId}`}
                    title={`${row.title} — ${TEAM_LABELS[cell.team]}: ${cell.state.toLowerCase()}`}
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-md text-xs transition-colors',
                      cell.state === 'COVERED' &&
                        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20',
                      cell.state === 'INTENTIONAL' && 'text-muted-foreground/50 hover:bg-muted',
                      cell.state === 'UNREVIEWED' &&
                        'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                    )}
                  >
                    {cell.state === 'COVERED' ? '●' : cell.state === 'INTENTIONAL' ? '–' : '⚠'}
                  </Link>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
