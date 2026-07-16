import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getPageBySlug } from '@/lib/handbook/queries'
import { toDetailResponse } from '@/lib/handbook/audience'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slug } = await params
    const page = await getPageBySlug(slug)
    if (!page) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const detail = toDetailResponse(page, user.teamTag)
    if (!detail) {
      // The page exists but nothing addresses this user's team, or it is
      // unpublished. A 404 is correct -- rendering an empty page would imply
      // the content is missing rather than not theirs.
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (error) {
    console.error('Failed to fetch handbook page:', error)
    return NextResponse.json({ error: 'Failed to fetch handbook page' }, { status: 500 })
  }
}
