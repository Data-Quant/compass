'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { LateFormSummaryView, LateFormsResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { FORM_LABELS, FormEditor } from './FormEditor'

/**
 * An earlier quarter HR reopened: the evaluations this person still owes it, one form each, until HR closes the
 * quarter. Renders nothing when there is none, or nothing is left.
 */
export function LateFormsSection() {
  const [data, setData] = useState<LateFormsResponse | null>(null)
  const [editing, setEditing] = useState<LateFormSummaryView | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<LateFormsResponse>('/api/weekly/late-forms'))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load your unfinished evaluations'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!data?.quarter || data.forms.length === 0) return null
  const { quarter } = data
  const done = data.total - data.forms.length
  return (
    <Card className="border-amber-500/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Finish your {quarter.name} evaluations</h2>
          <p className="text-sm text-muted-foreground">{done} of {data.total} done</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {quarter.name} ran before the weekly evaluations started, and these are still open. They count toward people’s {quarter.name} reports, so please finish them soon.
        </p>
        <ul className="divide-y">
          {data.forms.map((form) => {
            const who = form.relationshipType === 'DEPT' ? `${form.department ?? 'Unassigned'} department` : form.evaluatee.name
            return (
              <li key={`${form.relationshipType}-${form.evaluatee.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium">{who}</p>
                  <p className="text-xs text-muted-foreground">
                    {FORM_LABELS[form.relationshipType]}{form.relationshipType === 'DEPT' ? ` · applies to all ${form.memberCount} people in the department` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{form.status === 'DRAFT' ? 'Draft' : 'Not started'}</Badge>
                  <Button size="sm" variant="outline" aria-label={`Open the ${quarter.name} evaluation of ${who}`} onClick={() => setEditing(form)}>Open</Button>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
      {editing && (
        <FormEditor
          form={editing}
          periodId={quarter.periodId}
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
