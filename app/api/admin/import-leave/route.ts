import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'

/**
 * Parses the P21 Leave History CSV and creates LeaveRequests (APPROVED)
 * and updates LeaveBalance counters for 2026.
 *
 * Date formats in the CSV:
 *   "Jan 28"            -> single day
 *   "Jan 9: 1/2 day"   -> half day (counts as 0.5)
 *   "Feb 9 - 20"        -> date range
 *   "Jan 29 - Feb 2"    -> cross-month range
 *   "Jan 9, 30"          -> multiple dates in same month
 *   "Feb 11,12, Jan 20 -23" -> mixed months and ranges
 *   "Jan 1, Jan 20: 1/2 day" -> mix of full and half days
 *   "Jan 6 -12, March 30 - Apr 1" -> future dates (skip March+)
 */

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 11,
}

interface ParsedLeave {
  startDate: Date
  endDate: Date
  days: number // 0.5 for half day, or count of full days
  isHalf: boolean
}

function parseDateEntries(raw: string, year: number): ParsedLeave[] {
  if (!raw || !raw.trim()) return []

  const results: ParsedLeave[] = []
  // Split by comma but be careful with "Jan 20 -23" type ranges
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)

  let currentMonth: string | null = null

  for (let part of parts) {
    // Check for half day marker
    const isHalf = /1\/2\s*day/i.test(part)
    part = part.replace(/:\s*1\/2\s*day/i, '').trim()

    // Try to extract month from this part
    const monthMatch = part.match(/^(jan|feb|mar|march|apr|april|may|jun|jul|aug|sep|oct|nov|dec)\s*/i)
    if (monthMatch) {
      currentMonth = monthMatch[1].toLowerCase()
      part = part.substring(monthMatch[0].length).trim()
    }

    if (!currentMonth || !part) continue

    const monthNum = MONTH_MAP[currentMonth]
    if (monthNum === undefined) continue

    // Only process Jan and Feb 2026
    if (monthNum > 1) continue

    // Check for range: "20 - 23" or "20-23" or "29 - Feb 2"
    const rangeMatch = part.match(/^(\d+)\s*-\s*(?:(jan|feb|mar|march|apr|april)\s+)?(\d+)$/i)
    if (rangeMatch) {
      const startDay = parseInt(rangeMatch[1])
      const endMonthStr = rangeMatch[2]
      const endDay = parseInt(rangeMatch[3])

      let endMonth = monthNum
      if (endMonthStr) {
        endMonth = MONTH_MAP[endMonthStr.toLowerCase()] ?? monthNum
      }

      // Skip if end month is beyond Feb
      if (endMonth > 1) continue

      const startDate = new Date(year, monthNum, startDay)
      const endDate = new Date(year, endMonth, endDay)

      // Count weekdays
      let days = 0
      const d = new Date(startDate)
      while (d <= endDate) {
        const dow = d.getDay()
        if (dow !== 0 && dow !== 6) days++
        d.setDate(d.getDate() + 1)
      }

      results.push({ startDate, endDate, days, isHalf: false })
    } else {
      // Single day or multiple days separated by space: "11 12" (unlikely) or just "28"
      const dayNums = part.match(/\d+/g)
      if (dayNums) {
        for (const dayStr of dayNums) {
          const day = parseInt(dayStr)
          if (day < 1 || day > 31) continue
          const date = new Date(year, monthNum, day)
          results.push({
            startDate: date,
            endDate: date,
            days: isHalf ? 0.5 : 1,
            isHalf,
          })
        }
      }
    }
  }

  return results
}

interface CsvRow {
  name: string
  position: string
  sick: string
  casual: string
  annual: string
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  // Skip header row
  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    // Skip section headers and empty rows
    if (!line || line.startsWith(',') || /^(Morocco|Colombia|Indonesia)\s+Team/i.test(line)) continue

    // Simple CSV parse (handles quoted fields with commas)
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let j = 0; j < line.length; j++) {
      const ch = line[j]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())

    const name = fields[0]?.trim()
    if (!name) continue

    rows.push({
      name,
      position: fields[1]?.trim() || '',
      sick: fields[2]?.trim() || '',
      casual: fields[3]?.trim() || '',
      annual: fields[4]?.trim() || '',
    })
  }
  return rows
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { csvText, dryRun } = await request.json()
    if (!csvText) {
      return NextResponse.json({ error: 'csvText is required' }, { status: 400 })
    }

    const year = 2026
    const rows = parseCsv(csvText)

    // Load all users
    const allUsers = await prisma.user.findMany({ select: { id: true, name: true } })
    const userMap = new Map<string, { id: string; name: string }>()
    for (const u of allUsers) {
      userMap.set(u.name.toLowerCase().trim(), u)
    }

    const results: {
      name: string
      matched: boolean
      userId?: string
      sickDays: number
      casualDays: number
      annualDays: number
      requestsCreated: number
      details: string[]
    }[] = []

    let totalRequests = 0
    let totalMatched = 0
    let totalUnmatched = 0

    for (const row of rows) {
      const entry: typeof results[0] = {
        name: row.name,
        matched: false,
        sickDays: 0,
        casualDays: 0,
        annualDays: 0,
        requestsCreated: 0,
        details: [],
      }

      // Fuzzy match: try exact, then first+last name
      let matchedUser = userMap.get(row.name.toLowerCase().trim())
      if (!matchedUser) {
        // Try matching by first name only if unique
        const firstName = row.name.split(' ')[0].toLowerCase()
        const candidates = allUsers.filter(u => u.name.toLowerCase().startsWith(firstName))
        if (candidates.length === 1) matchedUser = candidates[0]
      }

      if (!matchedUser) {
        entry.details.push(`No matching user found for "${row.name}"`)
        totalUnmatched++
        results.push(entry)
        continue
      }

      entry.matched = true
      entry.userId = matchedUser.id
      totalMatched++

      // Parse each leave type
      const leaveTypes: { type: 'SICK' | 'CASUAL' | 'ANNUAL'; raw: string }[] = [
        { type: 'SICK', raw: row.sick },
        { type: 'CASUAL', raw: row.casual },
        { type: 'ANNUAL', raw: row.annual },
      ]

      let totalSick = 0
      let totalCasual = 0
      let totalAnnual = 0

      for (const lt of leaveTypes) {
        if (!lt.raw) continue
        const parsed = parseDateEntries(lt.raw, year)

        for (const p of parsed) {
          const days = p.days
          if (lt.type === 'SICK') totalSick += days
          else if (lt.type === 'CASUAL') totalCasual += days
          else totalAnnual += days

          entry.details.push(
            `${lt.type}: ${p.startDate.toLocaleDateString()} - ${p.endDate.toLocaleDateString()} (${days} day${days !== 1 ? 's' : ''}${p.isHalf ? ', half day' : ''})`
          )

          if (!dryRun) {
            await prisma.leaveRequest.create({
              data: {
                employeeId: matchedUser.id,
                leaveType: lt.type,
                startDate: p.startDate,
                endDate: p.endDate,
                reason: `Backfilled from leave history (${p.isHalf ? 'half day' : days + ' day' + (days !== 1 ? 's' : '')})`,
                transitionPlan: 'Historical record - backfilled',
                status: 'APPROVED',
                leadApprovedBy: user.id,
                leadApprovedAt: new Date(),
                hrApprovedBy: user.id,
                hrApprovedAt: new Date(),
              },
            })
            entry.requestsCreated++
            totalRequests++
          }
        }
      }

      entry.sickDays = totalSick
      entry.casualDays = totalCasual
      entry.annualDays = totalAnnual

      // Update LeaveBalance (upsert for 2026)
      if (!dryRun && (totalSick > 0 || totalCasual > 0 || totalAnnual > 0)) {
        await prisma.leaveBalance.upsert({
          where: {
            employeeId_year: { employeeId: matchedUser.id, year },
          },
          create: {
            employeeId: matchedUser.id,
            year,
            sickUsed: Math.ceil(totalSick),
            casualUsed: Math.ceil(totalCasual),
            annualUsed: Math.ceil(totalAnnual),
          },
          update: {
            sickUsed: { increment: Math.ceil(totalSick) },
            casualUsed: { increment: Math.ceil(totalCasual) },
            annualUsed: { increment: Math.ceil(totalAnnual) },
          },
        })
      }

      results.push(entry)
    }

    return NextResponse.json({
      success: true,
      dryRun: !!dryRun,
      summary: {
        totalRows: rows.length,
        matched: totalMatched,
        unmatched: totalUnmatched,
        requestsCreated: dryRun ? 0 : totalRequests,
      },
      results,
    })
  } catch (error) {
    console.error('Failed to import leave history:', error)
    return NextResponse.json({ error: 'Failed to import leave history' }, { status: 500 })
  }
}
