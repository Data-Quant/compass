import { isThreeEDepartment } from '@/lib/company-branding'

type PayrollEligibilityUser = {
  name?: string | null
  department?: string | null
  position?: string | null
  payrollProfile?: {
    isPayrollActive?: boolean | null
    designation?: string | null
    department?: { name?: string | null } | null
    employmentType?: { name?: string | null } | null
  } | null
}

function normalize(value: string | null | undefined) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function containsNoble(value: string | null | undefined) {
  return /\bnoble\b/i.test(value || '')
}

function isPartnerTitle(position: string | null | undefined) {
  const normalized = normalize(position)
  if (!normalized) return false
  if (/\bjunior partner\b/.test(normalized)) return false
  return /\bpartner\b/.test(normalized)
}

export function isEligiblePayrollEmployee(user: PayrollEligibilityUser) {
  if (user.payrollProfile?.isPayrollActive === false) return false
  if (isThreeEDepartment(user.department)) return false

  const payrollDepartment = user.payrollProfile?.department?.name
  const employmentType = user.payrollProfile?.employmentType?.name
  const designation = user.payrollProfile?.designation

  if (isThreeEDepartment(payrollDepartment)) return false
  if ([user.name, user.department, user.position, payrollDepartment, employmentType, designation].some(containsNoble)) {
    return false
  }

  return !isPartnerTitle(user.position) && !isPartnerTitle(designation)
}
