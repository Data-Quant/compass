import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getAllPagesForAdmin } from '@/lib/handbook/admin-queries'
import { computeCoverage, summarizeCoverage } from '@/lib/handbook/coverage'

const VALID_CATEGORIES = [
  'START_HERE',
  'THE_COMPANY',
  'POLICIES',
  'BENEFITS_AND_REWARDS',
  'PERFORMANCE',
  'HOW_TO',
] as const

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pages = await getAllPagesForAdmin()
    const coverage = computeCoverage(pages)
    return NextResponse.json({ pages, coverage, summary: summarizeCoverage(coverage) })
  } catch (error) {
    console.error('Failed to fetch handbook admin data:', error)
    return NextResponse.json({ error: 'Failed to fetch handbook' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slug, title, icon, category, orderIndex } = (await request.json()) as {
      slug?: string
      title?: string
      icon?: string
      category?: string
      orderIndex?: number
    }

    if (!slug || !title) {
      return NextResponse.json({ error: 'Slug and title are required' }, { status: 400 })
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json(
        { error: 'Slug must be lowercase words separated by hyphens' },
        { status: 400 }
      )
    }
    if (!category || !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    const page = await prisma.handbookPage.create({
      data: {
        slug,
        title,
        icon: icon || 'FileText',
        category: category as (typeof VALID_CATEGORIES)[number],
        orderIndex: orderIndex ?? 0,
        isPublished: false,
      },
    })

    return NextResponse.json({ page })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'A page with that slug already exists' }, { status: 400 })
    }
    console.error('Failed to create handbook page:', error)
    return NextResponse.json({ error: 'Failed to create page' }, { status: 500 })
  }
}
