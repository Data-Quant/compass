import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!user.benefitCategoryId) {
      return NextResponse.json({ category: null, benefits: [] })
    }

    const category = await prisma.benefitCategory.findUnique({
      where: { id: user.benefitCategoryId },
      select: {
        id: true,
        name: true,
        region: true,
        employeeType: true,
        isActive: true,
      },
    })

    const benefits = await prisma.benefit.findMany({
      where: {
        categoryId: user.benefitCategoryId,
        isActive: true,
      },
      orderBy: [{ orderIndex: 'asc' }, { title: 'asc' }],
    })

    return NextResponse.json({ category, benefits })
  } catch (error) {
    console.error('Failed to fetch user benefits:', error)
    return NextResponse.json({ error: 'Failed to fetch user benefits' }, { status: 500 })
  }
}
