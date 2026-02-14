import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import bcrypt from 'bcryptjs'

// POST - Set or reset password (Admin only, or user changing their own)
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSession()

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { userId, password, currentPassword } = body

    if (!userId || !password) {
      return NextResponse.json({ error: 'User ID and password required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Check authorization
    const isOwnAccount = userId === currentUser.id
    const isHR = isAdminRole(currentUser.role)

    if (!isOwnAccount && !isHR) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // If user is changing their own password, verify current password
    if (isOwnAccount) {
      // Fetch passwordHash directly since getSession no longer returns it
      const userWithHash = await prisma.user.findUnique({
        where: { id: currentUser.id },
        select: { passwordHash: true },
      })

      if (userWithHash?.passwordHash) {
        if (!currentPassword) {
          return NextResponse.json({ error: 'Current password required' }, { status: 400 })
        }

        const isValid = await bcrypt.compare(currentPassword, userWithHash.passwordHash)
        if (!isValid) {
          return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
        }
      }
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(password, 10)

    // Update user: set new password and increment passwordVersion
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordVersion: { increment: 1 },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to set password:', error)
    return NextResponse.json({ error: 'Failed to set password' }, { status: 500 })
  }
}

// DELETE - Remove password (Admin only) - allows user to log in without password again
export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getSession()

    if (!currentUser || !isAdminRole(currentUser.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Remove password and increment passwordVersion to invalidate sessions
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: null,
        passwordVersion: { increment: 1 },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove password:', error)
    return NextResponse.json({ error: 'Failed to remove password' }, { status: 500 })
  }
}
