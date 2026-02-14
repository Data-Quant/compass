import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

const VALID_USER_ROLES = ['EMPLOYEE', 'HR', 'SECURITY', 'OA'] as const

// GET - List all users
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        position: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            evaluatorMappings: true,
            evaluateeMappings: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

// POST - Create a new user
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, email, department, position, role, password } = await request.json()

    const normalizedName = typeof name === 'string' ? name.trim() : ''
    if (!normalizedName) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const normalizedRole = typeof role === 'string' ? role.toUpperCase() : 'EMPLOYEE'
    if (!VALID_USER_ROLES.includes(normalizedRole as (typeof VALID_USER_ROLES)[number])) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Hash password if provided
    let passwordHash = null
    if (password) {
      if (typeof password !== 'string' || password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
      }
      passwordHash = await bcrypt.hash(password, 10)
    }

    const newUser = await prisma.user.create({
      data: {
        name: normalizedName,
        email: email || null,
        department: department || null,
        position: position || null,
        role: normalizedRole as (typeof VALID_USER_ROLES)[number],
        passwordHash,
      },
    })

    return NextResponse.json({ success: true, user: newUser })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as any).code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }
    console.error('Failed to create user:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
}

// PUT - Update a user
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, name, email, department, position, role } = await request.json()

    if (!id || !name) {
      return NextResponse.json({ error: 'ID and name are required' }, { status: 400 })
    }

    const normalizedRole = typeof role === 'string' ? role.toUpperCase() : 'EMPLOYEE'
    if (!VALID_USER_ROLES.includes(normalizedRole as (typeof VALID_USER_ROLES)[number])) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name,
        email: email || null,
        department: department || null,
        position: position || null,
        role: normalizedRole as (typeof VALID_USER_ROLES)[number],
      },
    })

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as any).code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }
    console.error('Failed to update user:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a user
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    let id = searchParams.get('id')

    // Support legacy/clients that send JSON body with { id } for DELETE.
    if (!id) {
      try {
        const body = await request.json().catch(() => null)
        if (body && typeof body === 'object') {
          const candidate = (body as any).id ?? (body as any).userId
          if (typeof candidate === 'string') id = candidate
        }
      } catch {
        // Ignore body parse errors; we'll validate below.
      }
    }

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Prevent deleting yourself
    if (id === user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    await prisma.user.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete user:', error)
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    )
  }
}

