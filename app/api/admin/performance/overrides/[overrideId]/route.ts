import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ overrideId: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { overrideId } = await params

    const existing = await prisma.evaluationPeriodAssignmentOverride.findUnique({
      where: { id: overrideId },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Period override not found' }, { status: 404 })
    }

    await prisma.evaluationPeriodAssignmentOverride.delete({
      where: { id: overrideId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete evaluation period override:', error)
    return NextResponse.json(
      { error: 'Failed to delete evaluation period override' },
      { status: 500 }
    )
  }
}
