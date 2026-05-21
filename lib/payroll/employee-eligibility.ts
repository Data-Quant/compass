import { isThreeEDepartment } from '@/lib/company-branding'

export type PayrollEligibilityUser = {
  id?: string | null
  name?: string | null
  role?: string | null
  department?: string | null
  position?: string | null
  payrollProfile?: {
    isPayrollActive?: boolean | null
    designation?: string | null
    officialEmail?: string | null
    cnicNumber?: string | null
    joiningDate?: Date | string | null
    exitDate?: Date | string | null
    distanceKm?: number | null
    transportMode?: string | null
    bankName?: string | null
    accountTitle?: string | null
    accountNumber?: string | null
    department?: { name?: string | null } | null
    employmentType?: { name?: string | null } | null
    salaryRevisions?: unknown[] | null
  } | null
}

export function toPayrollEmployeeListItem(
  user: PayrollEligibilityUser,
  options: { includePayrollDetails?: boolean } = {}
) {
  const profile = user.payrollProfile

  return {
    id: user.id || '',
    name: user.name || '',
    role: profile?.designation || user.position || user.role || '',
    department: user.department || null,
    position: user.position || null,
    payrollProfile: profile
      ? {
          isPayrollActive: profile.isPayrollActive ?? null,
          designation: profile.designation || null,
          department: profile.department?.name ? { name: profile.department.name } : null,
          employmentType: profile.employmentType?.name ? { name: profile.employmentType.name } : null,
          ...(options.includePayrollDetails
            ? {
                officialEmail: profile.officialEmail || null,
                cnicNumber: profile.cnicNumber || null,
                joiningDate: profile.joiningDate || null,
                exitDate: profile.exitDate || null,
                distanceKm: profile.distanceKm ?? null,
                transportMode: profile.transportMode || null,
                bankName: profile.bankName || null,
                accountTitle: profile.accountTitle || null,
                accountNumber: profile.accountNumber || null,
                salaryRevisions: profile.salaryRevisions || [],
              }
            : {}),
        }
      : null,
  }
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
