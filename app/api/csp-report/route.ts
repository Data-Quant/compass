import { NextRequest, NextResponse } from 'next/server'

// Browsers send CSP violation reports as application/csp-report or application/reports+json.
// We accept either, log them, and return 204. No auth — this is a public endpoint by design
// (same origin as the page triggering the violation).
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    let payload: unknown
    if (contentType.includes('application/json') || contentType.includes('application/csp-report') || contentType.includes('application/reports+json')) {
      payload = await request.json().catch(() => null)
    } else {
      payload = await request.text().catch(() => null)
    }

    // Use console.warn so violations surface in Vercel logs without polluting error tracking.
    console.warn('[csp-report]', JSON.stringify(payload))
  } catch (error) {
    console.error('[csp-report] failed to parse', error)
  }

  return new NextResponse(null, { status: 204 })
}
