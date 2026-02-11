import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { setSession } from '@/lib/auth'
import { checkRateLimit, normalizeClientIp } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const ip = normalizeClientIp(
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    )
    const ipKey = `login:ip:${ip}`
    const ipLimit = checkRateLimit(ipKey, 20)
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const { name, password, newPassword, confirmPassword } = await request.json()

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const normalizedName = name.trim().toLowerCase()
    if (!normalizedName) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }
    const accountKey = `login:account:${normalizedName}`
    const accountLimit = checkRateLimit(accountKey, 10)
    if (!accountLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      )
    }

    // Use exact match instead of fuzzy contains
    const user = await prisma.user.findFirst({
      where: {
        name: {
          equals: name.trim(),
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

    // Set encrypted session cookie
    await setSession(user.id)

    // Return safe fields only
    return NextResponse.json({
      success: true,
      user: {
        name: user.name,
        department: user.department,
        position: user.position,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
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
  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}
