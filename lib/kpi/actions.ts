import { canClaim, canRequestChange, type KpiActor, type KpiRef } from './permissions'
import { transition, type KpiAction, type KpiStateLike, type MonthDeadlinesLike } from './state-machine'
import type { KpiActions } from './view-types'

/** What this viewer may do to this KPI right now; screens render only these buttons. Pass the effective status. */
export function availableActions(
  actor: KpiActor,
  kpi: KpiRef,
  state: KpiStateLike,
  month: MonthDeadlinesLike,
  now: Date,
  hasPendingChange: boolean,
): KpiActions {
  const allowed = (action: KpiAction) => transition(state, action, month, now).ok
  const claimer = canClaim(actor, kpi)
  const claim = claimer && (allowed({ type: 'CLAIM_DONE' }) || allowed({ type: 'REVISE_CLAIM' }))
  const respond = claimer && allowed({ type: 'RESPOND' })
  const appeal = claimer && allowed({ type: 'APPEAL' })
  const requestChange = !hasPendingChange && canRequestChange(actor, kpi) && allowed({ type: 'APPROVE_EDIT' })
  return { claim, respond, appeal, uploadEvidence: claim || respond || appeal, requestChange }
}
