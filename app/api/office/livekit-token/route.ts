import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { AccessToken } from 'livekit-server-sdk'

export async function POST(req: Request) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET

    if (!apiKey || !apiSecret) {
      console.error('LiveKit API key/secret not configured')
      return NextResponse.json(
        { error: 'Audio not configured' },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const rawRoomId = typeof body.roomId === 'string' ? body.roomId : 'main'
    const roomId = rawRoomId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'main'
    const roomName = `office-${roomId}`

    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: user.name,
      metadata: JSON.stringify({
        department: user.department,
        role: user.role,
        position: user.position,
      }),
    })

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    })

    const jwt = await token.toJwt()

    return NextResponse.json({ token: jwt, roomName })
  } catch (error) {
    console.error('Failed to generate LiveKit token:', error)
    return NextResponse.json(
      { error: 'Failed to generate audio token' },
      { status: 500 }
    )
  }
}
