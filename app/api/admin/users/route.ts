import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

// GET - List all users
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

// POST - Create a new user
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, email, department, position, role, password } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Hash password if provided
    let passwordHash = null
    if (password) {
      passwordHash = await bcrypt.hash(password, 10)
    }

    const newUser = await prisma.user.create({
      data: {
        name,
        email: email || null,
        department: department || null,
        position: position || null,
        role: role || 'EMPLOYEE',
        // Note: Add password field to schema if implementing password auth
      },
    })

    return NextResponse.json({ success: true, user: newUser })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    )
  }
}

// PUT - Update a user
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, name, email, department, position, role } = await request.json()

    if (!id || !name) {
      return NextResponse.json({ error: 'ID and name are required' }, { status: 400 })
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name,
        email: email || null,
        department: department || null,
        position: position || null,
        role: role || 'EMPLOYEE',
      },
    })

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a user
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete user' },
      { status: 500 }
    )
  }
}
