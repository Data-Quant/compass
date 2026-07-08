import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ASSET_LOCATIONS, getAssetLocationValuesForFilter } from '@/lib/asset-utils'
import { canManageAssets } from '@/lib/permissions'

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const counts = await prisma.equipmentAsset.groupBy({
      by: ['location'],
      where: {
        OR: ASSET_LOCATIONS.map((location) => ({
          location: { in: getAssetLocationValuesForFilter(location) },
        })),
      },
      _count: { _all: true },
    })

    const countByLocation = new Map<string, number>()
    for (const item of counts) {
      const location = ASSET_LOCATIONS.find((known) =>
        getAssetLocationValuesForFilter(known).includes(item.location || '')
      )
      if (!location) continue
      countByLocation.set(location, (countByLocation.get(location) || 0) + item._count._all)
    }
    // Only surface cities that actually hold assets; the office list now spans
    // many cities and rendering an empty card for each would be noise.
    const locations = ASSET_LOCATIONS.map((location) => ({
      location,
      count: countByLocation.get(location) || 0,
    })).filter((entry) => entry.count > 0)

    return NextResponse.json({ locations })
  } catch (error) {
    console.error('Failed to fetch asset location counts:', error)
    return NextResponse.json({ error: 'Failed to fetch asset location counts' }, { status: 500 })
  }
}
