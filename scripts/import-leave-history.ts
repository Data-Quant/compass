/**
 * One-time script to backfill leave history from "P21 Leave History - Sheet1.csv"
 * into the database (LeaveRequest records + LeaveBalance updates).
 *
 * Usage:
 *   npx tsx scripts/import-leave-history.ts [--dry-run]
 *
 * Flags:
 *   --dry-run   Parse and display what would be imported without writing to DB
 */

import { PrismaClient, LeaveType, LeaveStatus } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 11,
}

interface ParsedLeave {
  startDate: Date
  endDate: Date
  days: number
  isHalf: boolean
}

function parseDateEntries(raw: string, year: number): ParsedLeave[] {
  if (!raw || !raw.trim()) return []

  const results: ParsedLeave[] = []
  // Split on comma, but rejoin tokens that look like part of a range or month prefix
  const tokens = raw.split(',').map(s => s.trim()).filter(Boolean)

  let currentMonth: string | null = null

  for (let token of tokens) {
    const isHalf = /1\/2\s*day/i.test(token)
    token = token.replace(/:\s*1\/2\s*day/i, '').trim()

    // Check if this token starts with a month name
    const monthMatch = token.match(/^(jan|feb|mar|march|apr|april|may|jun|jul|aug|sep|oct|nov|dec)\s*/i)
    if (monthMatch) {
      currentMonth = monthMatch[1].toLowerCase()
      token = token.substring(monthMatch[0].length).trim()
    }

    if (!currentMonth || !token) continue

    const monthNum = MONTH_MAP[currentMonth]
    if (monthNum === undefined) continue

    // Only import Jan & Feb 2026
    if (monthNum > 1) continue

    // Check for cross-month range: "29 - Feb 2"
    const crossMonthRange = token.match(/^(\d+)\s*-\s*(jan|feb|mar|march|apr|april)\s+(\d+)$/i)
    if (crossMonthRange) {
      const startDay = parseInt(crossMonthRange[1])
      const endMonthStr = crossMonthRange[2].toLowerCase()
      const endDay = parseInt(crossMonthRange[3])
      const endMonth = MONTH_MAP[endMonthStr] ?? monthNum

      if (endMonth > 1) continue // Skip ranges ending beyond Feb

      const startDate = new Date(year, monthNum, startDay)
      const endDate = new Date(year, endMonth, endDay)

      let days = 0
      const d = new Date(startDate)
      while (d <= endDate) {
        const dow = d.getDay()
        if (dow !== 0 && dow !== 6) days++
        d.setDate(d.getDate() + 1)
      }

      results.push({ startDate, endDate, days, isHalf: false })
      continue
    }

    // Check for same-month range: "20 - 23" or "20-23"
    const sameMonthRange = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (sameMonthRange) {
      const startDay = parseInt(sameMonthRange[1])
      const endDay = parseInt(sameMonthRange[2])

      const startDate = new Date(year, monthNum, startDay)
      const endDate = new Date(year, monthNum, endDay)

      let days = 0
      const d = new Date(startDate)
      while (d <= endDate) {
        const dow = d.getDay()
        if (dow !== 0 && dow !== 6) days++
        d.setDate(d.getDate() + 1)
      }

      results.push({ startDate, endDate, days, isHalf: false })
      continue
    }

    // Single day(s): could be "28" or "11 12" (numbers separated by space in same token)
    const dayNums = token.match(/\d+/g)
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
  const rows: CsvRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || line.startsWith(',') || /^(Morocco|Colombia|Indonesia)\s+Team/i.test(line)) continue

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

async function main() {
  const isDryRun = process.argv.includes('--dry-run')
  console.log(`\n=== Leave History Import ${isDryRun ? '(DRY RUN)' : '(LIVE)'} ===\n`)

  const csvPath = path.join(process.cwd(), 'P21 Leave History - Sheet1.csv')
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at: ${csvPath}`)
    process.exit(1)
  }

  const csvText = fs.readFileSync(csvPath, 'utf-8')
  const rows = parseCsv(csvText)
  console.log(`Parsed ${rows.length} rows from CSV\n`)

  // Load all users
  const allUsers = await prisma.user.findMany({ select: { id: true, name: true } })
  const userMap = new Map<string, { id: string; name: string }>()
  for (const u of allUsers) {
    userMap.set(u.name.toLowerCase().trim(), u)
  }

  // Find an HR user to attribute approvals to
  const hrUser = await prisma.user.findFirst({ where: { role: 'HR' } })
  if (!hrUser) {
    console.error('No HR user found in database to attribute approvals to')
    process.exit(1)
  }
  console.log(`Using HR user "${hrUser.name}" for approval attribution\n`)

  let totalMatched = 0
  let totalUnmatched = 0
  let totalRequests = 0
  const year = 2026

  const unmatched: string[] = []

  for (const row of rows) {
    // Try exact match
    let matchedUser = userMap.get(row.name.toLowerCase().trim())

    // Try first-name match
    if (!matchedUser) {
      const firstName = row.name.split(' ')[0].toLowerCase()
      const candidates = allUsers.filter(u => u.name.toLowerCase().startsWith(firstName))
      if (candidates.length === 1) {
        matchedUser = candidates[0]
      }
    }

    if (!matchedUser) {
      unmatched.push(row.name)
      totalUnmatched++
      continue
    }

    totalMatched++

    const leaveTypes: { type: LeaveType; raw: string }[] = [
      { type: 'SICK', raw: row.sick },
      { type: 'CASUAL', raw: row.casual },
      { type: 'ANNUAL', raw: row.annual },
    ]

    let totalSick = 0
    let totalCasual = 0
    let totalAnnual = 0

    const requests: { type: LeaveType; start: Date; end: Date; days: number; isHalf: boolean }[] = []

    for (const lt of leaveTypes) {
      if (!lt.raw) continue
      const parsed = parseDateEntries(lt.raw, year)
      for (const p of parsed) {
        if (lt.type === 'SICK') totalSick += p.days
        else if (lt.type === 'CASUAL') totalCasual += p.days
        else totalAnnual += p.days

        requests.push({ type: lt.type, start: p.startDate, end: p.endDate, days: p.days, isHalf: p.isHalf })
      }
    }

    if (requests.length === 0) continue

    console.log(`${matchedUser.name} (matched from "${row.name}"):`)
    for (const r of requests) {
      const startStr = r.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const endStr = r.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const dateRange = startStr === endStr ? startStr : `${startStr} - ${endStr}`
      console.log(`  ${r.type.padEnd(7)} ${dateRange.padEnd(20)} ${r.days} day${r.days !== 1 ? 's' : ''}${r.isHalf ? ' (half)' : ''}`)
    }
    console.log(`  TOTALS: Sick=${totalSick}, Casual=${totalCasual}, Annual=${totalAnnual}`)

    if (!isDryRun) {
      // Create leave requests
      for (const r of requests) {
        await prisma.leaveRequest.create({
          data: {
            employeeId: matchedUser.id,
            leaveType: r.type,
            startDate: r.start,
            endDate: r.end,
            reason: `Backfilled from leave history (${r.isHalf ? 'half day' : r.days + ' day' + (r.days !== 1 ? 's' : '')})`,
            transitionPlan: 'Historical record - backfilled',
            status: 'APPROVED' as LeaveStatus,
            leadApprovedBy: hrUser.id,
            leadApprovedAt: new Date(),
            hrApprovedBy: hrUser.id,
            hrApprovedAt: new Date(),
          },
        })
        totalRequests++
      }

      // Update leave balance
      if (totalSick > 0 || totalCasual > 0 || totalAnnual > 0) {
        const existing = await prisma.leaveBalance.findUnique({
          where: { employeeId_year: { employeeId: matchedUser.id, year } },
        })

        if (existing) {
          await prisma.leaveBalance.update({
            where: { id: existing.id },
            data: {
              sickUsed: existing.sickUsed + totalSick,
              casualUsed: existing.casualUsed + totalCasual,
              annualUsed: existing.annualUsed + totalAnnual,
            },
          })
        } else {
          await prisma.leaveBalance.create({
            data: {
              employeeId: matchedUser.id,
              year,
              sickUsed: totalSick,
              casualUsed: totalCasual,
              annualUsed: totalAnnual,
            },
          })
        }
      }
    }

    console.log('')
  }

  console.log(`\n=== Summary ===`)
  console.log(`Total CSV rows:     ${rows.length}`)
  console.log(`Matched to users:   ${totalMatched}`)
  console.log(`Unmatched:          ${totalUnmatched}`)
  if (unmatched.length > 0) {
    console.log(`  Unmatched names: ${unmatched.join(', ')}`)
  }
  if (!isDryRun) {
    console.log(`Requests created:   ${totalRequests}`)
  }
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes made)' : 'LIVE (data written to DB)'}`)
  console.log('')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
