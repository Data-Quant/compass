import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { z } from 'zod'

const leaveBalanceUpdateSchema = z.object({
  employeeId: z.string().trim().min(1),
  year: z.coerce.number().int().min(2020).max(2100),
  casualDays: z.coerce.number().int().min(0).optional(),
  sickDays: z.coerce.number().int().min(0).optional(),
  annualDays: z.coerce.number().int().min(0).optional(),
})

// GET - Get leave balance for current user or specified employee
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId') || user.id
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())

    // Only allow own balance or admin
    if (employeeId !== user.id && !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Not authorized to view this balance' }, { status: 403 })
    }

    // Get or create balance for the year
    let balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_year: {
          employeeId,
          year,
        },
      },
    })
    
    // Create default balance if doesn't exist
    if (!balance) {
      balance = await prisma.leaveBalance.create({
        data: {
          employeeId,
          year,
        },
      })
    }
    
    // Calculate remaining days
    const remaining = {
      casual: balance.casualDays - balance.casualUsed,
      sick: balance.sickDays - balance.sickUsed,
      annual: balance.annualDays - balance.annualUsed,
    }
    
    return NextResponse.json({
      balance: {
        ...balance,
        remaining,
      },
    })
  } catch (error) {
    console.error('Failed to fetch leave balance:', error)
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 })
  }
}

// POST - Update leave balance (Admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Only admins can update balances
    if (!isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Only admin users can update leave balances' }, { status: 403 })
    }
    
    const body = await request.json()
    const parsed = leaveBalanceUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid leave balance update payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { employeeId, year, casualDays, sickDays, annualDays } = parsed.data

    const existingBalance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_year: {
          employeeId,
          year,
        },
      },
    })

    const nextTotals = {
      casualDays: casualDays ?? existingBalance?.casualDays ?? 10,
      sickDays: sickDays ?? existingBalance?.sickDays ?? 6,
      annualDays: annualDays ?? existingBalance?.annualDays ?? 14,
    }

    if (existingBalance) {
      if (nextTotals.casualDays < existingBalance.casualUsed) {
        return NextResponse.json({ error: 'Casual allocation cannot be lower than already-used casual leave' }, { status: 400 })
      }
      if (nextTotals.sickDays < existingBalance.sickUsed) {
        return NextResponse.json({ error: 'Sick allocation cannot be lower than already-used sick leave' }, { status: 400 })
      }
      if (nextTotals.annualDays < existingBalance.annualUsed) {
        return NextResponse.json({ error: 'Annual allocation cannot be lower than already-used annual leave' }, { status: 400 })
      }
    }
    
    const balance = await prisma.leaveBalance.upsert({
      where: {
        employeeId_year: {
          employeeId,
          year,
        },
      },
      update: {
        casualDays: nextTotals.casualDays,
        sickDays: nextTotals.sickDays,
        annualDays: nextTotals.annualDays,
      },
      create: {
        employeeId,
        year,
        casualDays: nextTotals.casualDays,
        sickDays: nextTotals.sickDays,
        annualDays: nextTotals.annualDays,
      },
    })
    
    return NextResponse.json({ success: true, balance })
  } catch (error) {
    console.error('Failed to update leave balance:', error)
    return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 })
  }
}
