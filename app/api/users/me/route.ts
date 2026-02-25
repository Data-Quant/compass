import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getSession()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const rawEmail = typeof body.email === 'string' ? body.email.trim() : ''
    const rawDiscordId = typeof body.discordId === 'string' ? body.discordId.trim() : ''

    if (rawEmail && !EMAIL_REGEX.test(rawEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        email: rawEmail || null,
        discordId: rawDiscordId || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        discordId: true,
        department: true,
        position: true,
        role: true,
      },
    })

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as any).code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }
    console.error('Failed to update profile details:', error)
    return NextResponse.json({ error: 'Failed to update profile details' }, { status: 500 })
  }
}
