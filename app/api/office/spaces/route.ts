import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { MAP_WIDTH, MAP_HEIGHT, SPAWN_X, SPAWN_Y } from '@/lib/office-config'
import { OFFICE_WORLD } from '@/shared/office-world'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Single hardcoded office space for MVP (no DB needed)
    const spaces = [
      {
        slug: 'main',
        name: 'Main Office',
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
        spawnX: SPAWN_X,
        spawnY: SPAWN_Y,
        maxPlayers: 30,
        isActive: true,
        world: OFFICE_WORLD,
      },
    ]

    return NextResponse.json({ spaces })
  } catch (error) {
    console.error('Failed to fetch office spaces:', error)
    return NextResponse.json(
      { error: 'Failed to fetch spaces' },
      { status: 500 }
    )
  }
}
