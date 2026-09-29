import { NextResponse, type NextRequest } from 'next/server'
import { MAX_EVIDENCE_BYTES, TOO_LARGE_MESSAGE } from '@/lib/kpi/evidence'
import { guardMutation, requireKpiSession, UPLOAD_LIMIT } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { uploadEvidence } from '@/lib/kpi/service/claims'
import { loadActor } from '@/lib/kpi/service/context'
import { KpiError } from '@/lib/kpi/service/errors'
import { configuredEvidenceStore } from '@/lib/kpi/service/evidence-store'

export const runtime = 'nodejs'

/** Room for the multipart wrapper around the file itself. */
const FORM_OVERHEAD_BYTES = 64 * 1024

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession()
    await guardMutation(request, user.id, UPLOAD_LIMIT)
    const store = configuredEvidenceStore()
    if (!store) throw new KpiError('File uploads are not set up yet. Add a link to the proof instead.', 503)
    if (Number(request.headers.get('content-length') ?? 0) > MAX_EVIDENCE_BYTES + FORM_OVERHEAD_BYTES) throw new KpiError(TOO_LARGE_MESSAGE, 413)
    const file = (await request.formData()).get('file')
    if (!(file instanceof File)) throw new KpiError('Choose a file to upload')
    const { id } = await context.params
    const { file: saved, kpiVersion } = await uploadEvidence(await loadActor(user), id, { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, store)
    return NextResponse.json({
      success: true,
      file: { id: saved.id, fileName: saved.fileName, size: saved.size, contentType: saved.contentType },
      kpiVersion,
    })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}
