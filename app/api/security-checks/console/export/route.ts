import { NextResponse, type NextRequest } from 'next/server'
import { errorResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { exportTasksCsv } from '@/lib/security-checks/service/exports'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const { actor } = await requireSecuritySession()
    const campaignId = request.nextUrl.searchParams.get('campaignId')?.slice(0, 64) || undefined
    const cycleId = request.nextUrl.searchParams.get('cycleId')?.slice(0, 64) || undefined
    const csv = await exportTasksCsv(actor, { campaignId, cycleId })
    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(`﻿${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="security-checks-${stamp}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
