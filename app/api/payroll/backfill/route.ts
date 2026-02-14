import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { canManagePayroll } from '@/lib/permissions'
import { runPayrollBackfill } from '@/lib/payroll/backfill'

export const runtime = 'nodejs'

const boolFromString = z
  .string()
  .optional()
  .refine((value) => value === undefined || value === 'true' || value === 'false', {
    message: 'Boolean fields must be "true" or "false"',
  })
  .transform((value) => (value === undefined ? undefined : value === 'true'))

const querySchema = z.object({
  months: z.coerce.number().int().min(1).max(120).optional(),
  tolerance: z.coerce.number().positive().optional(),
  lockApproved: boolFromString.optional(),
  useEmployeeRosterNames: boolFromString.optional(),
  overwriteLocked: boolFromString.optional(),
  persistImportRows: boolFromString.optional(),
})

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

    const parsed = querySchema.safeParse({
      months: form.get('months'),
      tolerance: form.get('tolerance'),
      lockApproved: form.get('lockApproved')?.toString(),
      useEmployeeRosterNames: form.get('useEmployeeRosterNames')?.toString(),
      overwriteLocked: form.get('overwriteLocked')?.toString(),
      persistImportRows: form.get('persistImportRows')?.toString(),
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid backfill request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const summary = await runPayrollBackfill({
      buffer: Buffer.from(arrayBuffer),
      actorId: user.id,
      fileName: file.name,
      months: parsed.data.months ?? 12,
      tolerance: parsed.data.tolerance ?? 1,
      lockApproved: parsed.data.lockApproved ?? true,
      useEmployeeRosterNames: parsed.data.useEmployeeRosterNames ?? true,
      overwriteLocked: parsed.data.overwriteLocked ?? false,
      persistImportRows: parsed.data.persistImportRows ?? false,
    })

    return NextResponse.json({
      success: true,
      summary,
    })
  } catch (error) {
    console.error('Failed to run payroll backfill:', error)
    const message = error instanceof Error ? error.message : 'Unknown backfill error'
    return NextResponse.json({ error: 'Failed to run payroll backfill', details: message }, { status: 500 })
  }
}
