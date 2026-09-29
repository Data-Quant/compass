import { NextResponse, type NextRequest } from 'next/server'
import { requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { readEvidence } from '@/lib/kpi/service/claims'
import { loadActor } from '@/lib/kpi/service/context'
import { KpiError } from '@/lib/kpi/service/errors'
import { configuredEvidenceStore } from '@/lib/kpi/service/evidence-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  try {
    const user = await requireKpiSession()
    const store = configuredEvidenceStore()
    if (!store) throw new KpiError('File not found', 404)
    const { fileId } = await context.params
    const { file, stored } = await readEvidence(await loadActor(user), fileId, store)
    // fileName is server-generated ([a-z0-9_-] plus an extension), so it is safe in the header.
    return new NextResponse(stored.stream, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}
