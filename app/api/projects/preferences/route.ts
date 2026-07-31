import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

const preferenceSchema = z.object({
  assigneeFilter: z.string().trim().min(1).max(191),
})

export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = preferenceSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid project preference payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const reservedFilter = parsed.data.assigneeFilter.toUpperCase()
    const assigneeFilter = reservedFilter === 'ALL' || reservedFilter === 'ME'
      ? reservedFilter
      : parsed.data.assigneeFilter

    if (assigneeFilter !== 'ALL' && assigneeFilter !== 'ME') {
      const selectedUser = await prisma.user.findUnique({
        where: { id: assigneeFilter },
        select: { id: true },
      })
      if (!selectedUser) {
        return NextResponse.json({ error: 'Selected assignee was not found' }, { status: 400 })
      }
    }

    const preference = await prisma.projectTaskViewPreference.upsert({
      where: { userId: user.id },
      update: { assigneeFilter },
      create: { userId: user.id, assigneeFilter },
      select: { assigneeFilter: true },
    })

    return NextResponse.json({ preference })
  } catch (error) {
    console.error('Failed to save project task preference:', error)
    return NextResponse.json({ error: 'Failed to save project task preference' }, { status: 500 })
  }
}
