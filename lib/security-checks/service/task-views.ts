// Loads a task with everything the task page needs and serialises it for the
// owning employee or a console viewer. Never includes storage paths.
import type { Prisma } from '@prisma/client'
import type { AnswerMap, QuestionDef } from '../answers'
import { nonCompliantQuestions } from '../answers'
import { canRequestNa, isSubtaskEditable } from '../submission'
import {
  canEmployeeEdit,
  checkSubmission,
  reviewDeadlineOf,
  taskCloseOf,
  wrapUpEndOf,
  type TaskTimelineState,
} from '../timeline'
import { TASK_STATUS_LABELS, type SubtaskSource, type SubtaskStatus, type TaskStatus } from '../types'
import { allowsEmployeeSubtasks } from '../schemas'

export const TASK_DETAIL_INCLUDE = {
  cycle: { include: { campaign: { include: { questions: { orderBy: { position: 'asc' } } } } } },
  subtasks: { orderBy: { position: 'asc' }, include: { files: { orderBy: { createdAt: 'asc' } } } },
  submissions: { orderBy: { round: 'asc' } },
  reviewActions: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.SecurityTaskInclude

export type TaskWithDetail = Prisma.SecurityTaskGetPayload<{ include: typeof TASK_DETAIL_INCLUDE }>

export function questionDefs(task: TaskWithDetail): QuestionDef[] {
  return task.cycle.campaign.questions.map((question) => ({
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    compliantAnswer: question.compliantAnswer,
  }))
}

export function timelineOf(task: Pick<TaskWithDetail, 'status' | 'deadline' | 'resubmitDueAt' | 'finalRoundAt' | 'expiryReason' | 'reopenedAt'>): TaskTimelineState {
  return {
    status: task.status as TaskStatus,
    deadline: task.deadline,
    resubmitDueAt: task.resubmitDueAt,
    finalRoundAt: task.finalRoundAt,
    reopenedAt: task.reopenedAt,
    expiryReason: task.expiryReason,
  }
}

export function answersOf(value: Prisma.JsonValue): AnswerMap {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnswerMap) : {}
}

export interface EvidenceFileView {
  id: string
  fileName: string
  contentType: string
  size: number
  createdAt: string
  submitted: boolean
  deleted: boolean
  deletedReason: string | null
}

export interface SubtaskView {
  id: string
  name: string
  source: SubtaskSource
  status: SubtaskStatus
  answers: AnswerMap
  declarationConfirmed: boolean
  naRequested: boolean
  naJustification: string | null
  lastVerdict: string | null
  lastVerdictReason: string | null
  nonCompliantQuestionIds: string[]
  files: EvidenceFileView[]
  editable: boolean
  canRequestNa: boolean
}

export interface HistoryEntry {
  at: string
  kind: 'SUBMISSION' | 'REVIEW'
  label: string
  reason: string | null
  subtaskName: string | null
  selfReview: boolean
  actorId: string | null
}

export interface TaskDetailView {
  id: string
  userId: string
  status: TaskStatus
  statusLabel: string
  campaign: {
    id: string
    name: string
    control: string
    instructions: string
    instructionImages: Array<{ path: string; name: string }>
    videoUrl: string | null
    evidenceRequired: boolean
    fileLimit: number
    subtaskMode: string
    questions: QuestionDef[]
  }
  cycle: { id: string; number: number; openAt: string; deadline: string; scheduledCloseAt: string }
  deadline: string
  originalDeadline: string
  taskCloseAt: string
  wrapUpEndAt: string
  reviewDueAt: string | null
  resubmitDueAt: string | null
  finalRoundAt: string | null
  lateEnrollment: boolean
  extension: { at: string; reason: string | null } | null
  exemptionReason: string | null
  expiryReason: string | null
  naReason: string | null
  cancelReason: string | null
  unreviewedFlag: boolean
  subtasks: SubtaskView[]
  canEdit: boolean
  canSubmit: boolean
  submitWillBeFinal: boolean
  canManageSubtasks: boolean
  history: HistoryEntry[]
}

const ACTION_LABELS: Record<string, string> = {
  VERIFY: 'Verified',
  REJECT: 'Rejected',
  REQUEST_INFO: 'More information requested',
  APPROVE_NA: 'N/A approved',
  DENY_NA: 'N/A denied',
  REOPEN: 'Reopened for review',
  TASK_NA: 'Marked not applicable',
}

const iso = (value: Date | null) => (value ? value.toISOString() : null)

export function toTaskDetailView(task: TaskWithDetail, now: Date, viewer: { isOwner: boolean }): TaskDetailView {
  const campaign = task.cycle.campaign
  const status = task.status as TaskStatus
  const timeline = timelineOf(task)
  const questions = questionDefs(task)
  const editable = viewer.isOwner && canEmployeeEdit(timeline, now)
  const submission = checkSubmission(timeline, now)
  const subtaskNames = new Map(task.subtasks.map((subtask) => [subtask.id, subtask.name]))

  const subtasks: SubtaskView[] = task.subtasks.map((subtask) => {
    const answers = answersOf(subtask.answers)
    return {
      id: subtask.id,
      name: subtask.name,
      source: subtask.source,
      status: subtask.status,
      answers,
      declarationConfirmed: subtask.declarationConfirmed,
      naRequested: subtask.naRequested,
      naJustification: subtask.naJustification,
      lastVerdict: subtask.lastVerdict,
      lastVerdictReason: subtask.lastVerdictReason,
      nonCompliantQuestionIds: subtask.source === 'DECLARATION' ? [] : nonCompliantQuestions(questions, answers).map((q) => q.id),
      files: subtask.files.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        contentType: file.contentType,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
        submitted: file.submissionId !== null,
        deleted: file.deletedAt !== null,
        deletedReason: file.deletedReason,
      })),
      editable: editable && isSubtaskEditable(status, subtask.status),
      canRequestNa: canRequestNa(subtask),
    }
  })

  const history: HistoryEntry[] = [
    ...task.submissions.map((entry) => ({
      at: entry.createdAt.toISOString(),
      kind: 'SUBMISSION' as const,
      label: entry.round === 1 ? 'Submitted' : entry.isFinal ? `Final resubmission (round ${entry.round})` : `Resubmitted (round ${entry.round})`,
      reason: null,
      subtaskName: null,
      selfReview: false,
      actorId: entry.submittedById,
    })),
    ...task.reviewActions.map((action) => ({
      at: action.createdAt.toISOString(),
      kind: 'REVIEW' as const,
      label: ACTION_LABELS[action.action] ?? action.action,
      reason: action.reason,
      subtaskName: action.subtaskId ? (subtaskNames.get(action.subtaskId) ?? null) : null,
      selfReview: action.selfReview,
      actorId: action.reviewerId,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return {
    id: task.id,
    userId: task.userId,
    status,
    statusLabel: TASK_STATUS_LABELS[status],
    campaign: {
      id: campaign.id,
      name: campaign.name,
      control: campaign.control,
      instructions: campaign.instructions,
      instructionImages: Array.isArray(campaign.instructionImages) ? (campaign.instructionImages as Array<{ path: string; name: string }>) : [],
      videoUrl: campaign.videoUrl,
      evidenceRequired: campaign.evidenceRequired,
      fileLimit: campaign.fileLimit,
      subtaskMode: campaign.subtaskMode,
      questions,
    },
    cycle: {
      id: task.cycle.id,
      number: task.cycle.number,
      openAt: task.cycle.openAt.toISOString(),
      deadline: task.cycle.deadline.toISOString(),
      scheduledCloseAt: task.cycle.scheduledCloseAt.toISOString(),
    },
    deadline: task.deadline.toISOString(),
    originalDeadline: task.originalDeadline.toISOString(),
    taskCloseAt: taskCloseOf(task.deadline).toISOString(),
    wrapUpEndAt: wrapUpEndOf(task.deadline).toISOString(),
    reviewDueAt: status === 'PENDING_REVIEW' ? reviewDeadlineOf(timeline).toISOString() : null,
    resubmitDueAt: iso(task.resubmitDueAt),
    finalRoundAt: iso(task.finalRoundAt),
    lateEnrollment: task.lateEnrollment,
    extension: task.extendedAt ? { at: task.extendedAt.toISOString(), reason: task.extensionReason } : null,
    exemptionReason: task.exemptionReason,
    expiryReason: task.expiryReason,
    naReason: task.naReason,
    cancelReason: task.cancelReason,
    unreviewedFlag: task.unreviewedFlag,
    subtasks,
    canEdit: editable,
    canSubmit: viewer.isOwner && submission.ok,
    submitWillBeFinal: submission.ok && submission.isFinal,
    canManageSubtasks: editable && allowsEmployeeSubtasks(campaign.subtaskMode) && task.firstSubmittedAt === null,
    history,
  }
}

export interface TaskListItem {
  id: string
  campaignId: string
  campaignName: string
  control: string
  status: TaskStatus
  statusLabel: string
  deadline: string
  resubmitDueAt: string | null
  cycleNumber: number
  lateEnrollment: boolean
  extended: boolean
  needsAction: boolean
}

export function toTaskListItem(
  task: Prisma.SecurityTaskGetPayload<{ include: { cycle: { include: { campaign: { select: { name: true; control: true } } } } } }>,
  now: Date,
): TaskListItem {
  const status = task.status as TaskStatus
  return {
    id: task.id,
    campaignId: task.campaignId,
    campaignName: task.cycle.campaign.name,
    control: task.cycle.campaign.control,
    status,
    statusLabel: TASK_STATUS_LABELS[status],
    deadline: task.deadline.toISOString(),
    resubmitDueAt: iso(task.resubmitDueAt),
    cycleNumber: task.cycle.number,
    lateEnrollment: task.lateEnrollment,
    extended: task.extendedAt !== null,
    needsAction: canEmployeeEdit(timelineOf(task), now),
  }
}
