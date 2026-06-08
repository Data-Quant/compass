import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ASSET_LOCATIONS } from '@/lib/asset-utils'
import { canManageAssets } from '@/lib/permissions'

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const counts = await prisma.equipmentAsset.groupBy({
      by: ['location'],
      where: { location: { in: [...ASSET_LOCATIONS] } },
      _count: { _all: true },
    })

    const countByLocation = new Map(counts.map((item) => [item.location, item._count._all]))
    const locations = ASSET_LOCATIONS.map((location) => ({
      location,
      count: countByLocation.get(location) || 0,
    }))

    return NextResponse.json({ locations })
  } catch (error) {
    console.error('Failed to fetch asset location counts:', error)
    return NextResponse.json({ error: 'Failed to fetch asset location counts' }, { status: 500 })
  }
}
