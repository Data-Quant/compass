import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { name, password, newPassword, confirmPassword } = await request.json()

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

    // First-time setup: user has no password yet
    if (!user.passwordHash) {
      const setupPassword = newPassword ?? password
      const confirm = confirmPassword ?? password
      if (!setupPassword || setupPassword.length < 6) {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters' },
          { status: 400 }
        )
      }
      if (setupPassword !== confirm) {
        return NextResponse.json(
          { error: 'Passwords do not match' },
          { status: 400 }
        )
      }
      const passwordHash = await bcrypt.hash(setupPassword, 10)
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      })
      // Fall through to set session
    } else {
      // Sign in: verify existing password
      if (!password) {
        return NextResponse.json(
          { error: 'Password is required' },
          { status: 400 }
        )
      }
      const isValid = await bcrypt.compare(password, user.passwordHash)
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid password' },
          { status: 401 }
        )
      }
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
        passwordHash: true,
      },
      orderBy: {
        name: 'asc',
      },
    })

    // Don't send passwordHash to client; only whether they have one set
    const usersWithHasPassword = users.map(({ passwordHash, ...u }) => ({
      ...u,
      hasPassword: !!passwordHash,
    }))

    return NextResponse.json({ users: usersWithHasPassword })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch users' },
      { status: 500 }
    )
  }
}
