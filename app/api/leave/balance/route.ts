import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

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

    // Only allow own balance or HR
    if (employeeId !== user.id && user.role !== 'HR') {
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

// POST - Update leave balance (HR only)
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Only HR can update balances
    if (user.role !== 'HR') {
      return NextResponse.json({ error: 'Only HR can update leave balances' }, { status: 403 })
    }
    
    const body = await request.json()
    const { employeeId, year, casualDays, sickDays, annualDays } = body
    
    if (!employeeId || !year) {
      return NextResponse.json({ error: 'Employee ID and year required' }, { status: 400 })
    }
    
    const balance = await prisma.leaveBalance.upsert({
      where: {
        employeeId_year: {
          employeeId,
          year,
        },
      },
      update: {
        casualDays: casualDays ?? undefined,
        sickDays: sickDays ?? undefined,
        annualDays: annualDays ?? undefined,
      },
      create: {
        employeeId,
        year,
        casualDays: casualDays ?? 10,
        sickDays: sickDays ?? 6,
        annualDays: annualDays ?? 14,
      },
    })
    
    return NextResponse.json({ success: true, balance })
  } catch (error) {
    console.error('Failed to update leave balance:', error)
    return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 })
  }
}
