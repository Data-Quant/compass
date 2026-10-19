import { NextResponse, type NextRequest } from 'next/server'
import { errorResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { CAMPAIGN_IMAGE_PREFIX } from '@/lib/security-checks/schemas'
import { vercelBlobStore } from '@/lib/security-checks/service/blob-store'
import { SecurityChecksError } from '@/lib/security-checks/service/errors'

export const runtime = 'nodejs'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg'])

/** Serves instruction example images (non-sensitive) to signed-in users. */
export async function GET(request: NextRequest) {
  try {
    await requireSecuritySession()
    const path = request.nextUrl.searchParams.get('path') ?? ''
    if (!path.startsWith(CAMPAIGN_IMAGE_PREFIX) || path.includes('..')) throw new SecurityChecksError('Invalid image path', 400)
    const blob = await vercelBlobStore().open(path)
    if (!blob || !IMAGE_TYPES.has(blob.contentType)) throw new SecurityChecksError('Not found', 404)
    return new NextResponse(blob.stream, {
      headers: {
        'Content-Type': blob.contentType,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
