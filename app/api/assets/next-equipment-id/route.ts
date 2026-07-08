import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { DEFAULT_ASSET_CATEGORY, getEquipmentIdPrefix, getNextEquipmentId } from '@/lib/asset-utils'
import { canManageAssets } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = (searchParams.get('category') || DEFAULT_ASSET_CATEGORY).trim()
    const prefix = getEquipmentIdPrefix(category)

    const existing = await prisma.equipmentAsset.findMany({
      where: { equipmentId: { startsWith: `${prefix}-`, mode: 'insensitive' } },
      select: { equipmentId: true },
    })

    return NextResponse.json({
      equipmentId: getNextEquipmentId(category, existing.map((asset) => asset.equipmentId)),
    })
  } catch (error) {
    console.error('Failed to generate next equipment ID:', error)
    return NextResponse.json({ error: 'Failed to generate next equipment ID' }, { status: 500 })
  }
}
