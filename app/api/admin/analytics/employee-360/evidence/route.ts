import { NextRequest } from 'next/server'
import { z } from 'zod'
import { relationshipTypeSchema } from '@/lib/analytics/employee-360-contracts'
import type { RelationshipType } from '@/types'
import {
  Employee360RequestError,
  getScorablePeriods,
  loadEvidenceRows,
  resolveSelectedPeriod,
} from '../_data'
import { assembleEvidencePayload } from '../_assemble'
import { employee360Json, requireEmployee360Hr } from '../_http'

const evidenceQuerySchema = z
  .object({
    employeeId: z.string().trim().min(1).max(200),
    periodId: z.string().trim().min(1).max(200).optional(),
    domain: z.enum(['EVALUATION', 'SELF_EVALUATION']).default('EVALUATION'),
    lens: relationshipTypeSchema.optional(),
    revealEvaluator: z.enum(['true', 'false']).default('false'),
  })
  .superRefine((value, context) => {
    if (
      value.domain === 'SELF_EVALUATION' &&
      value.lens !== undefined &&
      value.lens !== 'SELF'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lens'],
        message: 'Self-evaluation evidence only supports the SELF lens',
      })
    }
  })

/**
 * Lazy narrative/question evidence. Evaluator identity is hidden by default and
 * only included after an explicit HR request with revealEvaluator=true.
 */
export async function GET(request: NextRequest) {
  const user = await requireEmployee360Hr()
  if (!user) return employee360Json({ error: 'Unauthorized' }, { status: 401 })

  const query = evidenceQuerySchema.safeParse({
    employeeId: request.nextUrl.searchParams.get('employeeId') ?? undefined,
    periodId: request.nextUrl.searchParams.get('periodId') ?? undefined,
    domain: request.nextUrl.searchParams.get('domain') ?? undefined,
    lens: request.nextUrl.searchParams.get('lens') ?? undefined,
    revealEvaluator:
      request.nextUrl.searchParams.get('revealEvaluator') ?? undefined,
  })
  if (!query.success) {
    return employee360Json(
      {
        error: 'Invalid Employee 360 evidence query',
        details: query.error.flatten().fieldErrors,
      },
      { status: 400 }
    )
  }

  try {
    const periods = await getScorablePeriods()
    const period = resolveSelectedPeriod(periods, query.data.periodId)
    const rows = await loadEvidenceRows({
      employeeId: query.data.employeeId,
      periodId: period.id,
    })
    const payload = assembleEvidencePayload({
      generatedAt: new Date(),
      period,
      rows,
      domain: query.data.domain,
      lens:
        query.data.domain === 'SELF_EVALUATION'
          ? 'SELF'
          : ((query.data.lens ?? null) as RelationshipType | null),
      revealEvaluator: query.data.revealEvaluator === 'true',
    })
    return employee360Json(payload)
  } catch (error) {
    if (error instanceof Employee360RequestError) {
      return employee360Json({ error: error.message }, { status: error.status })
    }
    console.error('Failed to load Employee 360 evidence:', error)
    return employee360Json(
      { error: 'Failed to load Employee 360 evidence' },
      { status: 500 }
    )
  }
}
