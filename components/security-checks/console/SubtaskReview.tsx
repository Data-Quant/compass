'use client'

import { useState } from 'react'
import { Download, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { QuestionDef } from '@/lib/security-checks/answers'
import type { SubtaskView } from '@/lib/security-checks/service/task-views'
import { SubtaskStatusBadge } from '../StatusBadge'
import { formatBytes } from '../format'

type Verdict = 'VERIFY' | 'REJECT' | 'REQUEST_INFO' | 'APPROVE_NA' | 'DENY_NA'

interface SubtaskReviewProps {
  subtask: SubtaskView
  questions: QuestionDef[]
  showName: boolean
  canReview: boolean
  canDownload: boolean
  busy: boolean
  onVerdict: (action: Verdict, reason: string) => void
  onProhibited: (fileId: string, reason: string) => void
}

function answerText(value: boolean | string | undefined): string {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return value ?? '—'
}

export function SubtaskReview({ subtask, questions, showName, canReview, canDownload, busy, onVerdict, onProhibited }: SubtaskReviewProps) {
  const [reason, setReason] = useState('')
  const pending = subtask.status === 'PENDING_REVIEW'
  const nonCompliant = new Set(subtask.nonCompliantQuestionIds)
  const needsReason = reason.trim().length < 3

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          {showName && <p className="font-medium">{subtask.name}</p>}
          <SubtaskStatusBadge status={subtask.status} />
        </div>
        {subtask.source === 'DECLARATION' ? (
          <p className="text-sm">{subtask.declarationConfirmed ? 'Declaration confirmed.' : 'Declaration not confirmed.'}</p>
        ) : subtask.naRequested ? (
          <p className="rounded-md bg-muted p-3 text-sm">N/A requested: {subtask.naJustification}</p>
        ) : (
          <dl className="space-y-1 text-sm">
            {questions.map((question) => (
              <div key={question.id} className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">{question.prompt}</dt>
                <dd className={nonCompliant.has(question.id) ? 'font-medium text-destructive' : 'font-medium'}>
                  {answerText(subtask.answers[question.id])}
                  {nonCompliant.has(question.id) && ' (non-compliant)'}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {subtask.files.length > 0 && (
          <div className="space-y-1">
            {subtask.files.map((file) => (
              <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className={file.deleted ? 'text-muted-foreground line-through' : ''}>{file.fileName} · {formatBytes(file.size)}</span>
                {file.deleted ? (
                  <span className="text-xs text-muted-foreground">{file.deletedReason}</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Button asChild size="sm" variant="ghost"><a href={`/api/security-checks/evidence/${file.id}`} target="_blank" rel="noopener noreferrer"><Eye className="mr-1 h-4 w-4" />View</a></Button>
                    {canDownload && <Button asChild size="sm" variant="ghost"><a href={`/api/security-checks/evidence/${file.id}?download=1`}><Download className="mr-1 h-4 w-4" />Download</a></Button>}
                    {canReview && (
                      <Button size="sm" variant="ghost" className="text-destructive" disabled={busy || needsReason} title="Write the reason below first" onClick={() => onProhibited(file.id, reason)}>
                        Delete: prohibited content
                      </Button>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {canReview && pending && (
          <div className="space-y-2 border-t border-border pt-3">
            <Input placeholder="Reason (required to reject, request info, deny N/A or delete a file)" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              {subtask.naRequested ? (
                <>
                  <Button size="sm" disabled={busy} onClick={() => onVerdict('APPROVE_NA', reason)}>Approve N/A</Button>
                  <Button size="sm" variant="destructive" disabled={busy || needsReason} onClick={() => onVerdict('DENY_NA', reason)}>Deny N/A</Button>
                </>
              ) : (
                <Button size="sm" disabled={busy || nonCompliant.size > 0} title={nonCompliant.size > 0 ? 'Non-compliant answers can never be verified' : undefined} onClick={() => onVerdict('VERIFY', reason)}>Verify</Button>
              )}
              <Button size="sm" variant="outline" disabled={busy || needsReason} onClick={() => onVerdict('REQUEST_INFO', reason)}>Request info</Button>
              <Button size="sm" variant="destructive" disabled={busy || needsReason} onClick={() => onVerdict('REJECT', reason)}>Reject</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
