import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json()

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    // Find user by name (case-insensitive, handle variations)
    const user = await prisma.user.findFirst({
      where: {
        name: {
          contains: name,
          mode: 'insensitive',
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Set session cookie
    const cookieStore = await cookies()
    cookieStore.set('user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return NextResponse.json({ success: true, user })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Authentication failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        position: true,
        role: true,
      },
      orderBy: {
        name: 'asc',
      },
    })

    return NextResponse.json({ users })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch users' },
      { status: 500 }
    )
  }
}
