import { isThreeEDepartment } from '@/lib/company-branding'
import { calculateLeaveDuration, hasLeaveEnded, isValidLeaveDateRange } from '@/lib/leave-utils'

export const WFH_STATUSES = [
  'PENDING',
  'LEAD_APPROVED',
  'HR_APPROVED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const

export type WfhStatus = (typeof WFH_STATUSES)[number]

export function canRequestWfh(department: string | null | undefined) {
  return isThreeEDepartment(department)
}

export function calculateWfhDays(startDate: Date, endDate: Date) {
  return calculateLeaveDuration(startDate, endDate, false)
}

export function isValidWfhDateRange(startDate: Date, endDate: Date) {
  return isValidLeaveDateRange(startDate, endDate)
}

export function wfhRequiresLeadApproval(superiorLeadCount: number) {
  return superiorLeadCount > 0
}

export function hasWfhEnded(endDate: Date, now = new Date()) {
  return hasLeaveEnded(endDate, now)
}
