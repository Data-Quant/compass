import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, guardMutation, okResponse, requireSecuritySession, scheduleEmailDelivery } from '@/lib/security-checks/http'
import {
  approveAllSchema,
  extensionSchema,
  prohibitedDeleteSchema,
  reasonWithSelfReviewSchema,
  verdictSchema,
} from '@/lib/security-checks/schemas'
import { vercelBlobStore } from '@/lib/security-checks/service/blob-store'
import { SecurityChecksError } from '@/lib/security-checks/service/errors'
import { approveAll, deleteProhibitedEvidence, reopenTask, reviewSubtask } from '@/lib/security-checks/service/review'
import { getConsoleTask } from '@/lib/security-checks/service/review-queue'
import { exemptTask, grantExtension, markTaskNotApplicable } from '@/lib/security-checks/service/task-admin'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string; action: string }> }

const prohibitedSchema = prohibitedDeleteSchema.extend({ fileId: z.string().min(1).max(64), selfReviewJustification: z.string().trim().min(10).max(1000).optional() }).strict()

export async function POST(request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    const { id, action } = await context.params
    const now = new Date()
    const body = await request.json()
    switch (action) {
      case 'verdict':
        await reviewSubtask(actor, id, verdictSchema.parse(body), now)
        break
      case 'approve-all':
        await approveAll(actor, id, approveAllSchema.parse(body).selfReviewJustification, now)
        break
      case 'reopen':
        await reopenTask(actor, id, reasonWithSelfReviewSchema.parse(body), now)
        break
      case 'extend':
        await grantExtension(actor, id, extensionSchema.parse(body), now)
        break
      case 'exempt':
        await exemptTask(actor, id, reasonWithSelfReviewSchema.parse(body), now)
        break
      case 'not-applicable':
        await markTaskNotApplicable(actor, id, reasonWithSelfReviewSchema.parse(body), now)
        break
      case 'prohibited': {
        const input = prohibitedSchema.parse(body)
        await deleteProhibitedEvidence(actor, id, input.fileId, input.reason, now, vercelBlobStore(), undefined, input.selfReviewJustification)
        break
      }
      default:
        throw new SecurityChecksError('Not found', 404)
    }
    scheduleEmailDelivery()
    return okResponse(await getConsoleTask(actor, id, now))
  } catch (error) {
    return errorResponse(error)
  }
}
