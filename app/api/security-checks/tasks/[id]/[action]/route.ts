import { NextResponse, type NextRequest } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { errorResponse, guardMutation, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { employeeSubtaskSchema, evidenceCompleteSchema, evidenceTokenPayloadSchema, submitSchema } from '@/lib/security-checks/schemas'
import { blobToken, vercelBlobStore } from '@/lib/security-checks/service/blob-store'
import { manageEmployeeSubtask } from '@/lib/security-checks/service/employee-subtasks'
import { SecurityChecksError } from '@/lib/security-checks/service/errors'
import { authoriseUpload, completeUpload } from '@/lib/security-checks/service/evidence'
import { getMyTask, submitTask } from '@/lib/security-checks/service/tasks'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string; action: string }> }

export async function POST(request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    const { id, action } = await context.params
    const now = new Date()
    switch (action) {
      case 'submit': {
        submitSchema.parse(await request.json())
        return okResponse(await submitTask(actor, id, now))
      }
      case 'subtasks': {
        await manageEmployeeSubtask(actor, id, employeeSubtaskSchema.parse(await request.json()), now, vercelBlobStore())
        return okResponse(await getMyTask(actor, id, now))
      }
      case 'upload': {
        // Issues a short-lived client-upload token only after the request passes every server check.
        const body = (await request.json()) as HandleUploadBody
        if (body.type !== 'blob.generate-client-token') throw new SecurityChecksError('Unsupported upload event', 400)
        const result = await handleUpload({
          token: blobToken(),
          request,
          body,
          onBeforeGenerateToken: async (pathname, clientPayload) => {
            const payload = evidenceTokenPayloadSchema.parse(JSON.parse(clientPayload ?? '{}'))
            if (payload.taskId !== id) throw new SecurityChecksError('Upload does not match this task', 400)
            const permit = await authoriseUpload(actor, payload, pathname, now)
            return { ...permit, tokenPayload: null }
          },
        })
        return NextResponse.json(result)
      }
      case 'evidence': {
        const input = evidenceCompleteSchema.parse(await request.json())
        return okResponse(await completeUpload(actor, id, input, now, vercelBlobStore()), 201)
      }
      default:
        throw new SecurityChecksError('Not found', 404)
    }
  } catch (error) {
    return errorResponse(error)
  }
}
