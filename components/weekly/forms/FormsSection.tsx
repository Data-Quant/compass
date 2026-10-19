'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { FormStatusValue, FormSummaryView, FormsResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { FORM_LABELS, FormEditor } from './FormEditor'

const STATUS_LABELS: Record<FormStatusValue, string> = {
  NOT_STARTED: 'Not started', DRAFT: 'Draft', SUBMITTED: 'Submitted', CLOSED_BY_OTHER: 'Submitted by another HR evaluator',
}

/** Renders nothing for people with no C-Level, Department or HR forms. */
export function FormsSection() {
  const [data, setData] = useState<FormsResponse | null>(null)
  const [editing, setEditing] = useState<FormSummaryView | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<FormsResponse>('/api/weekly/forms'))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load your end-of-quarter forms'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!data || data.forms.length === 0) return null
  const done = data.forms.filter((f) => f.status === 'SUBMITTED' || f.status === 'CLOSED_BY_OTHER').length
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">End-of-quarter forms</h2>
          <p className="text-sm text-muted-foreground">{done} of {data.forms.length} submitted</p>
        </div>
        {!data.open && data.opensAt && <p className="text-sm text-muted-foreground">These open on {formatKarachiDate(data.opensAt)}.</p>}
        <ul className="divide-y">
          {data.forms.map((form) => {
            const who = form.relationshipType === 'DEPT' ? `${form.department ?? 'Unassigned'} department` : form.evaluatee.name
            return (
              <li key={`${form.relationshipType}-${form.evaluatee.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium">{FORM_LABELS[form.relationshipType]} · {who}</p>
                  {form.relationshipType === 'DEPT' && <p className="text-xs text-muted-foreground">Applies to all {form.memberCount} people in the department</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={form.status === 'SUBMITTED' ? 'default' : 'outline'}>{STATUS_LABELS[form.status]}</Badge>
                  <Button size="sm" variant="outline" disabled={!data.open} aria-label={`Open the ${FORM_LABELS[form.relationshipType]} form for ${form.relationshipType === 'DEPT' ? who : form.evaluatee.name}`} onClick={() => setEditing(form)}>
                    Open
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
      {editing && (
        <FormEditor
          form={editing}
          onClose={() => setEditing(null)}
          onSubmitted={async () => {
            setEditing(null)
            await load()
          }}
        />
      )}
    </Card>
  )
}
