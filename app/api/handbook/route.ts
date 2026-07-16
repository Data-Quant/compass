import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllPages } from '@/lib/handbook/queries'
import { toHubResponse } from '@/lib/handbook/audience'
import { resolvePreviewTeam } from '@/lib/handbook/preview'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Filtering happens here, on the server, against the resolved tag -- the
    // user's own, unless they are HR previewing another team. Never return
    // every variant for the client to filter: teams differ on compensation
    // terms, so that would leak other teams' terms via devtools.
    const tag = resolvePreviewTeam(request.nextUrl.searchParams.get('previewTeam'), user)
    const pages = await getAllPages()
    return NextResponse.json(toHubResponse(pages, tag))
  } catch (error) {
    console.error('Failed to fetch handbook hub:', error)
    return NextResponse.json({ error: 'Failed to fetch handbook' }, { status: 500 })
  }
}
