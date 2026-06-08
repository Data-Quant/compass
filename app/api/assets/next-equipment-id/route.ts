import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getNextEquipmentId } from '@/lib/asset-utils'
import { canManageAssets } from '@/lib/permissions'

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existing = await prisma.equipmentAsset.findMany({
      where: { equipmentId: { startsWith: 'EQUIP-', mode: 'insensitive' } },
      select: { equipmentId: true },
    })

    return NextResponse.json({
      equipmentId: getNextEquipmentId(existing.map((asset) => asset.equipmentId)),
    })
  } catch (error) {
    console.error('Failed to generate next equipment ID:', error)
    return NextResponse.json({ error: 'Failed to generate next equipment ID' }, { status: 500 })
  }
}
