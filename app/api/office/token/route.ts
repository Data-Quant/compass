import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateOfficeToken } from '@/lib/office-token'

export async function POST() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = generateOfficeToken({
      id: user.id,
      name: user.name,
      department: user.department,
      position: user.position,
      role: user.role,
      avatarBodyType: user.avatarBodyType,
      avatarHairStyle: user.avatarHairStyle,
      avatarHairColor: user.avatarHairColor,
      avatarSkinTone: user.avatarSkinTone,
      avatarShirtColor: user.avatarShirtColor,
    })

    const serverUrl = process.env.NEXT_PUBLIC_OFFICE_SERVER_URL || 'ws://localhost:2567'

    return NextResponse.json({ token, serverUrl })
  } catch (error) {
    console.error('Failed to generate office token:', error)
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
}
