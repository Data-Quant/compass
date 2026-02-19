import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll, canEditPayrollMaster } from '@/lib/permissions'

export const runtime = 'nodejs'

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/,/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseDistanceRange(raw: string) {
  const match = raw.match(/(\d+)\s*-\s*(\d+)/)
  if (!match) return null
  return {
    minKm: Number(match[1]),
    maxKm: Number(match[2]),
  }
}

function parseDateToken(token: string, year: number): Date | null {
  const match = token.trim().match(/^(\d{1,2})-([A-Za-z]{3})$/)
  if (!match) return null
  const day = Number(match[1])
  const monthShort = match[2].toLowerCase()
  const monthMap: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  }
  const month = monthMap[monthShort]
  if (month === undefined) return null
  return new Date(Date.UTC(year, month, day))
}

function toTransportMode(raw: string | undefined): 'CAR' | 'BIKE' | 'PUBLIC_TRANSPORT' | null {
  const value = (raw || '').trim().toLowerCase()
  if (value === 'car') return 'CAR'
  if (value === 'bike') return 'BIKE'
  if (value.includes('public')) return 'PUBLIC_TRANSPORT'
  return null
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    const periodId = typeof form.get('periodId') === 'string' ? String(form.get('periodId')).trim() : ''
    const effectiveFromRaw =
      typeof form.get('effectiveFrom') === 'string' ? String(form.get('effectiveFrom')).trim() : ''
    const replaceTiers = String(form.get('replaceTiers') || 'false') === 'true'
    const effectiveFrom = effectiveFromRaw ? new Date(effectiveFromRaw) : new Date()
    if (Number.isNaN(effectiveFrom.getTime())) {
      return NextResponse.json({ error: 'Invalid effectiveFrom date' }, { status: 400 })
    }

    if (periodId) {
      const period = await prisma.payrollPeriod.findUnique({
        where: { id: periodId },
        select: { id: true, status: true },
      })
      if (!period) {
        return NextResponse.json({ error: 'periodId does not exist' }, { status: 400 })
      }
      if (['APPROVED', 'SENDING', 'SENT', 'LOCKED'].includes(period.status)) {
        return NextResponse.json({ error: `Attendance import blocked for ${period.status} periods` }, { status: 400 })
      }
    }

    const text = await file.text()
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false })
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: 'Invalid CSV', details: parsed.errors[0]?.message }, { status: 400 })
    }
    const rows = (parsed.data || []) as string[][]

    let attendanceHeaderIndex = -1
    let monthYear = { month: 0, year: new Date().getUTCFullYear() }
    const travelTierRows: Array<{
      minKm: number
      maxKm: number
      bikeRate: number
      carPublicRate: number
    }> = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map((cell) => (cell || '').trim())
      const distanceRange = parseDistanceRange(row[0] || '')
      const bikeRate = parseNumber(row[1])
      const carRate = parseNumber(row[2])
      if (distanceRange && bikeRate !== null && carRate !== null) {
        travelTierRows.push({
          minKm: distanceRange.minKm,
          maxKm: distanceRange.maxKm,
          bikeRate,
          carPublicRate: carRate,
        })
      }

      if (row.includes('Location') && row.includes('Name') && row.includes('Mode of Transport')) {
        attendanceHeaderIndex = i
        const monthToken = row.find((cell) => /^[A-Za-z]+-\d{4}$/.test(cell))
        if (monthToken) {
          const [monthName, yearRaw] = monthToken.split('-')
          const map: Record<string, number> = {
            january: 0,
            february: 1,
            march: 2,
            april: 3,
            may: 4,
            june: 5,
            july: 6,
            august: 7,
            september: 8,
            october: 9,
            november: 10,
            december: 11,
          }
          monthYear = {
            month: map[monthName.toLowerCase()] ?? monthYear.month,
            year: Number(yearRaw) || monthYear.year,
          }
        }
      }
    }

    if (replaceTiers && canEditPayrollMaster(user.role)) {
      await prisma.payrollTravelAllowanceTier.updateMany({
        where: { isActive: true },
        data: { isActive: false, effectiveTo: new Date(effectiveFrom.getTime() - 86400000) },
      })
    }

    let tiersInserted = 0
    if (travelTierRows.length > 0 && canEditPayrollMaster(user.role)) {
      const payload = travelTierRows.flatMap((row) => [
        {
          transportMode: 'BIKE' as const,
          minKm: row.minKm,
          maxKm: row.maxKm,
          monthlyRate: row.bikeRate,
          effectiveFrom,
          effectiveTo: null,
          isActive: true,
        },
        {
          transportMode: 'CAR' as const,
          minKm: row.minKm,
          maxKm: row.maxKm,
          monthlyRate: row.carPublicRate,
          effectiveFrom,
          effectiveTo: null,
          isActive: true,
        },
        {
          transportMode: 'PUBLIC_TRANSPORT' as const,
          minKm: row.minKm,
          maxKm: row.maxKm,
          monthlyRate: row.carPublicRate,
          effectiveFrom,
          effectiveTo: null,
          isActive: true,
        },
      ])
      await prisma.payrollTravelAllowanceTier.createMany({ data: payload })
      tiersInserted = payload.length
    }

    const users = await prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    const userByName = new Map(users.map((u) => [u.name.trim().toLowerCase(), u.id]))

    let profilesUpdated = 0
    let attendanceUpdated = 0
    const unresolvedNames: string[] = []

    if (attendanceHeaderIndex >= 0) {
      const header = rows[attendanceHeaderIndex].map((cell) => (cell || '').trim())
      const dateColumns: Array<{ index: number; date: Date }> = []
      for (let i = 0; i < header.length; i++) {
        const parsedDate = parseDateToken(header[i], monthYear.year)
        if (parsedDate) {
          dateColumns.push({ index: i, date: parsedDate })
        }
      }

      for (let rowIndex = attendanceHeaderIndex + 1; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex].map((cell) => (cell || '').trim())
        const name = row[1]
        if (!name) continue

        const userId = userByName.get(name.toLowerCase())
        if (!userId) {
          unresolvedNames.push(name)
          continue
        }

        const distance = parseNumber(row[3]) ?? null
        const transportMode = toTransportMode(row[2])

        await prisma.payrollEmployeeProfile.upsert({
          where: { userId },
          update: {
            distanceKm: distance,
            transportMode,
          },
          create: {
            userId,
            distanceKm: distance,
            transportMode,
            isPayrollActive: true,
          },
        })
        profilesUpdated++

        if (!periodId) continue
        for (const col of dateColumns) {
          const token = (row[col.index] || '').toUpperCase()
          if (token !== 'P' && token !== 'A') continue
          await prisma.payrollAttendanceEntry.upsert({
            where: {
              userId_attendanceDate: {
                userId,
                attendanceDate: col.date,
              },
            },
            update: {
              periodId,
              status: token === 'P' ? 'PRESENT' : 'ABSENT',
              source: 'IMPORT',
              updatedById: user.id,
            },
            create: {
              periodId,
              userId,
              attendanceDate: col.date,
              status: token === 'P' ? 'PRESENT' : 'ABSENT',
              source: 'IMPORT',
              updatedById: user.id,
            },
          })
          attendanceUpdated++
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        tiersInserted,
        profilesUpdated,
        attendanceUpdated,
        unresolvedNames: [...new Set(unresolvedNames)],
      },
    })
  } catch (error) {
    console.error('Failed to import payroll attendance CSV:', error)
    return NextResponse.json({ error: 'Failed to import payroll attendance CSV' }, { status: 500 })
  }
}
