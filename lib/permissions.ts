export type AppUserRole = 'EMPLOYEE' | 'HR' | 'SECURITY' | 'OA'

export function isAdminRole(role: string | null | undefined): role is 'HR' | 'OA' {
  return role === 'HR' || role === 'OA'
}

export function canManagePayroll(role: string | null | undefined): boolean {
  return isAdminRole(role)
}

export function canManageSupport(role: string | null | undefined): boolean {
  return role === 'HR' || role === 'SECURITY'
}
