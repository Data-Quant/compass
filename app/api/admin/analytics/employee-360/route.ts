import { NextRequest } from 'next/server'
import { z } from 'zod'
import { profilePayloadSchema } from '@/lib/analytics/employee-360-contracts'
import {
  Employee360RequestError,
  getScorablePeriods,
  loadCachedAnalyticsContext,
  loadDossierRows,
  resolveSelectedPeriod,
} from './_data'
import { assembleDossier, toPeriodRef } from './_assemble'
import {
  employee360Json,
  requireEmployee360Hr,
} from './_http'

const profileQuerySchema = z
  .object({
    employeeId: z.string().trim().min(1).max(200),
    periodId: z.string().trim().min(1).max(200).optional(),
    compareId: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((value, context) => {
    if (value.compareId === value.employeeId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['compareId'],
        message: 'compareId must be different from employeeId',
      })
    }
  })

/**
 * HR-only, read-only Employee 360 dossier endpoint.
 *
 * Primary and comparison subjects are loaded through the same batched queries
 * and assembled with the same selected-period context, so comparison never
 * mixes periods or calculation rules.
 */
export async function GET(request: NextRequest) {
  const user = await requireEmployee360Hr()
  if (!user) return employee360Json({ error: 'Unauthorized' }, { status: 401 })

  const query = profileQuerySchema.safeParse({
    employeeId: request.nextUrl.searchParams.get('employeeId') ?? undefined,
    periodId: request.nextUrl.searchParams.get('periodId') ?? undefined,
    compareId: request.nextUrl.searchParams.get('compareId') ?? undefined,
  })
  if (!query.success) {
    return employee360Json(
      {
        error: 'Invalid Employee 360 query',
        details: query.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  try {
    const generatedAt = new Date()
    const periods = await getScorablePeriods()
    const selectedPeriod = resolveSelectedPeriod(periods, query.data.periodId)
    const analytics = await loadCachedAnalyticsContext(periods, selectedPeriod)
    const employeeIds = [
      query.data.employeeId,
      ...(query.data.compareId ? [query.data.compareId] : []),
    ]
    const rows = await loadDossierRows(employeeIds)
    const build = (employeeId: string) =>
      assembleDossier({
        employeeId,
        generatedAt,
        periods,
        selectedPeriod,
        analytics,
        rows,
      })

    const payload = profilePayloadSchema.parse({
      generatedAt: generatedAt.toISOString(),
      selectedPeriod: toPeriodRef(selectedPeriod),
      primary: build(query.data.employeeId),
      comparison: query.data.compareId ? build(query.data.compareId) : null,
    })
    return employee360Json(payload)
  } catch (error) {
    if (error instanceof Employee360RequestError) {
      return employee360Json({ error: error.message }, { status: error.status })
    }
    console.error('Failed to build Employee 360 profile:', error)
    return employee360Json(
      { error: 'Failed to build Employee 360 profile' },
      { status: 500 }
    )
  }
}
