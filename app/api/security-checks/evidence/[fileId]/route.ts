import { NextResponse, type NextRequest } from 'next/server'
import { errorResponse, guardMutation, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { vercelBlobStore } from '@/lib/security-checks/service/blob-store'
import { openEvidence, removeDraftEvidence } from '@/lib/security-checks/service/evidence'

export const runtime = 'nodejs'

type Context = { params: Promise<{ fileId: string }> }

/** Streams evidence through an authorised route; every view and download is audit-logged. */
export async function GET(request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    const { fileId } = await context.params
    const download = request.nextUrl.searchParams.get('download') === '1'
    const file = await openEvidence(actor, fileId, download ? 'download' : 'view', vercelBlobStore())
    const disposition = `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`
    const headers: Record<string, string> = {
      'Content-Type': file.contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
    }
    // Images are fully sandboxed. PDFs keep the browser's built-in viewer working (a CSP
    // sandbox blocks it), so they only get frame-ancestors; the viewer runs out of page origin.
    headers['Content-Security-Policy'] = file.contentType.startsWith('image/')
      ? "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'"
      : "frame-ancestors 'self'"
    return new NextResponse(file.stream, { headers })
  } catch (error) {
    return errorResponse(error)
  }
}

/** The employee removes a file they have not submitted yet. */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    const { fileId } = await context.params
    await removeDraftEvidence(actor, fileId, new Date(), vercelBlobStore())
    return okResponse({ removed: true })
  } catch (error) {
    return errorResponse(error)
  }
}
