import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateOfficeToken } from '@/lib/office-token'
import { getOfficeBootstrapForUser } from '@/lib/office-v2'

export async function POST() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bootstrap = await getOfficeBootstrapForUser(user)
    const hasOfficeAvatar = !bootstrap.avatarNeedsSetup
    const token = generateOfficeToken({
      id: user.id,
      name: user.name,
      department: user.department,
      position: user.position,
      role: user.role,
      avatarSkinTone: hasOfficeAvatar ? user.avatarSkinTone : null,
      avatarSchemaVersion: user.avatarSchemaVersion,
      avatarBodyFrame: bootstrap.avatar.avatarBodyFrame,
      avatarOutfitType: bootstrap.avatar.avatarOutfitType,
      avatarOutfitColor: bootstrap.avatar.avatarOutfitColor,
      avatarOutfitAccentColor: bootstrap.avatar.avatarOutfitAccentColor,
      avatarHairCategory: bootstrap.avatar.avatarHairCategory,
      avatarHeadCoveringType: bootstrap.avatar.avatarHeadCoveringType,
      avatarHeadCoveringColor: bootstrap.avatar.avatarHeadCoveringColor,
      avatarAccessories: bootstrap.avatar.avatarAccessories,
      cubicleId: bootstrap.assignment.cubicleId,
      leadershipOfficeId: bootstrap.assignment.leadershipOfficeId,
      seniorOfficeEligible: bootstrap.assignment.seniorOfficeEligible,
    })

    const serverUrl = bootstrap.serverUrl

    return NextResponse.json({
      token,
      serverUrl,
      assignment: bootstrap.assignment,
      world: bootstrap.world,
      avatar: bootstrap.avatar,
      avatarNeedsSetup: bootstrap.avatarNeedsSetup,
      user: { id: user.id, name: user.name },
      catalog: bootstrap.catalog,
    })
  } catch (error) {
    console.error('Failed to generate office token:', error)
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
}
