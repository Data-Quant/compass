import { NextRequest } from 'next/server'
import {
  getScorablePeriods,
  loadDirectoryCompensationCoverage,
  loadDirectoryEvaluationCoverage,
  loadDirectoryRows,
} from '../_data'
import { assembleDirectoryPayload } from '../_assemble'
import { employee360Json, requireEmployee360Hr } from '../_http'

/**
 * Lightweight roster and period bootstrap for the Employee 360 cockpit.
 * Offboarded employees remain discoverable and are explicitly marked ARCHIVED;
 * employees without a payroll profile remain ACTIVE.
 */
export async function GET(_request: NextRequest) {
  const user = await requireEmployee360Hr()
  if (!user) return employee360Json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const generatedAt = new Date()
    const [periods, rows, compensationCoverage] = await Promise.all([
      getScorablePeriods(),
      loadDirectoryRows(),
      loadDirectoryCompensationCoverage(),
    ])
    const evaluationCoverage = await loadDirectoryEvaluationCoverage(
      periods.map((period) => period.id)
    )
    const payload = assembleDirectoryPayload({
      generatedAt,
      periods,
      rows,
      evaluationCoverage,
      compensationCoverage,
    })
    return employee360Json(payload)
  } catch (error) {
    console.error('Failed to load Employee 360 directory:', error)
    return employee360Json(
      { error: 'Failed to load Employee 360 directory' },
      { status: 500 }
    )
  }
}
