'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { AssetAssignment, AssetEvent } from './types'

interface AssetHistoryTimelineProps {
  assignments: AssetAssignment[]
  events: AssetEvent[]
}

function formatDate(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function eventLabel(eventType: string) {
  return eventType.replace(/_/g, ' ')
}

export function AssetHistoryTimeline({ assignments, events }: AssetHistoryTimelineProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold">Assignment History</h3>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignment history yet.</p>
          ) : (
            <div className="space-y-3">
              {assignments.map((entry) => (
                <div key={entry.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-medium text-foreground">{entry.employee.name}</p>
                    <Badge variant="outline">{entry.unassignedAt ? 'Returned' : 'Active'}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Assigned {formatDate(entry.assignedAt)} by {entry.assignedBy.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Unassigned {formatDate(entry.unassignedAt)}
                    {entry.unassignedBy ? ` by ${entry.unassignedBy.name}` : ''}
                  </p>
                  {entry.assignmentNote && (
                    <p className="text-xs mt-1 text-foreground">Assignment note: {entry.assignmentNote}</p>
                  )}
                  {entry.returnNote && (
                    <p className="text-xs mt-1 text-foreground">Return note: {entry.returnNote}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold">Event Log</h3>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events logged yet.</p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Badge variant="outline">{eventLabel(event.eventType)}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Actor: {event.actor?.name || 'System'}
                  </p>
                  {event.payloadJson != null ? (
                    <pre className="mt-2 text-[11px] text-foreground bg-muted p-2 rounded overflow-x-auto">
                      {JSON.stringify(event.payloadJson, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

