import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const items = await prisma.equipmentAsset.findMany({
      where: {
        currentAssigneeId: user.id,
      },
      select: {
        id: true,
        equipmentId: true,
        assetName: true,
        category: true,
        brand: true,
        model: true,
        serialNumber: true,
        status: true,
        condition: true,
        warrantyEndDate: true,
        location: true,
        notes: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Failed to fetch my assets:', error)
    return NextResponse.json({ error: 'Failed to fetch my assets' }, { status: 500 })
  }
}

