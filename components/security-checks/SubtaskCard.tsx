'use client'

import { useId, useState } from 'react'
import { FileText, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import type { AnswerValue, QuestionDef } from '@/lib/security-checks/answers'
import { nonCompliantQuestions } from '@/lib/security-checks/answers'
import type { SubtaskView } from '@/lib/security-checks/service/task-views'
import { EvidenceUploader } from './EvidenceUploader'
import { SubtaskStatusBadge } from './StatusBadge'
import { formatBytes } from './format'

export interface SubtaskDraft {
  answers: Record<string, AnswerValue>
  declarationConfirmed: boolean
  naRequested: boolean
  naJustification: string
}

interface SubtaskCardProps {
  taskId: string
  subtask: SubtaskView
  draft: SubtaskDraft
  questions: QuestionDef[]
  evidenceRequired: boolean
  fileLimit: number
  showName: boolean
  canManage: boolean
  onChange: (draft: SubtaskDraft) => void
  onFilesChanged: () => void
  onRemoveFile: (fileId: string) => void
  onRename: (name: string) => void
  onDelete: () => void
}

function QuestionInput({ question, value, disabled, onChange }: { question: QuestionDef; value: AnswerValue | undefined; disabled: boolean; onChange: (value: AnswerValue) => void }) {
  const id = useId()
  if (question.type === 'YES_NO') {
    return (
      <div className="space-y-1">
        <p className="text-sm text-foreground">{question.prompt}</p>
        <RadioGroup className="flex gap-4" value={value === true ? 'yes' : value === false ? 'no' : ''} onValueChange={(next) => onChange(next === 'yes')} disabled={disabled}>
          {(['yes', 'no'] as const).map((option) => (
            <div key={option} className="flex items-center gap-2">
              <RadioGroupItem value={option} id={`${id}-${option}`} />
              <Label htmlFor={`${id}-${option}`} className="font-normal">{option === 'yes' ? 'Yes' : 'No'}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="font-normal">{question.prompt}</Label>
      <Input id={id} value={typeof value === 'string' ? value : ''} maxLength={500} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

export function SubtaskCard(props: SubtaskCardProps) {
  const { subtask, draft, questions, editable } = { ...props, editable: props.subtask.editable }
  const naId = useId()
  const declarationId = useId()
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(subtask.name)
  const isDeclaration = subtask.source === 'DECLARATION'
  const activeFiles = subtask.files.filter((file) => !file.deleted)
  const uploadedThisRound = activeFiles.filter((file) => !file.submitted).length
  const nonCompliant = isDeclaration ? [] : nonCompliantQuestions(questions, draft.answers)
  const set = (patch: Partial<SubtaskDraft>) => props.onChange({ ...draft, ...patch })

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {props.showName && !renaming && <p className="font-medium text-foreground">{subtask.name}</p>}
          {renaming && (
            <div className="flex flex-1 gap-2">
              <Input value={newName} maxLength={200} onChange={(event) => setNewName(event.target.value)} />
              <Button size="sm" onClick={() => { props.onRename(newName); setRenaming(false) }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            {props.canManage && subtask.source === 'EMPLOYEE' && !renaming && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>Rename</Button>
                <Button size="sm" variant="ghost" onClick={props.onDelete} aria-label={`Remove ${subtask.name}`}><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
            {subtask.status !== 'OPEN' && <SubtaskStatusBadge status={subtask.status} />}
          </div>
        </div>

        {subtask.lastVerdictReason && (subtask.status === 'REJECTED' || subtask.status === 'REQUIRES_INFO') && (
          <p className="rounded-md bg-destructive/5 p-3 text-sm text-destructive">Reviewer: {subtask.lastVerdictReason}</p>
        )}

        {isDeclaration ? (
          <div className="flex items-start gap-2">
            <Checkbox id={declarationId} checked={draft.declarationConfirmed} disabled={!editable} onCheckedChange={(value) => set({ declarationConfirmed: value === true })} />
            <Label htmlFor={declarationId} className="font-normal leading-snug">{subtask.name}</Label>
          </div>
        ) : (
          <>
            {!draft.naRequested && questions.map((question) => (
              <QuestionInput key={question.id} question={question} value={draft.answers[question.id]} disabled={!editable} onChange={(value) => set({ answers: { ...draft.answers, [question.id]: value } })} />
            ))}
            {nonCompliant.length > 0 && !draft.naRequested && (
              <p className="text-sm text-destructive">An answer here does not meet the control. Fix the issue first — a non-compliant answer is returned to you, never verified.</p>
            )}
            {subtask.canRequestNa && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox id={naId} checked={draft.naRequested} disabled={!editable} onCheckedChange={(value) => set({ naRequested: value === true })} />
                  <Label htmlFor={naId} className="font-normal">This does not apply to me (request N/A)</Label>
                </div>
                {draft.naRequested && (
                  <Textarea placeholder="Explain why, e.g. “I don’t have a GitHub account”" value={draft.naJustification} maxLength={1000} disabled={!editable} onChange={(event) => set({ naJustification: event.target.value })} />
                )}
              </div>
            )}
            {props.evidenceRequired && !draft.naRequested && (
              <div className="space-y-2">
                {activeFiles.map((file) => (
                  <div key={file.id} className="flex items-center justify-between gap-2 text-sm">
                    <a href={`/api/security-checks/evidence/${file.id}`} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 underline underline-offset-2">
                      <FileText className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{file.fileName}</span>
                    </a>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {formatBytes(file.size)}
                      {editable && !file.submitted && (
                        <Button size="sm" variant="ghost" onClick={() => props.onRemoveFile(file.id)} aria-label={`Remove ${file.fileName}`}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </span>
                  </div>
                ))}
                {subtask.files.filter((file) => file.deleted && file.deletedReason?.startsWith('Prohibited')).map((file) => (
                  <p key={file.id} className="text-sm text-destructive">{file.fileName} was deleted: {file.deletedReason}</p>
                ))}
                {editable && (
                  <EvidenceUploader taskId={props.taskId} subtaskId={subtask.id} uploadedThisRound={uploadedThisRound} fileLimit={props.fileLimit} onUploaded={props.onFilesChanged} />
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
