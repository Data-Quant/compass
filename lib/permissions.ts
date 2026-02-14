export type AppUserRole = 'EMPLOYEE' | 'HR' | 'SECURITY' | 'OA'

// "Admin" means HR-only access to /admin and /api/admin/*.
export function isAdminRole(role: string | null | undefined): role is 'HR' {
  return role === 'HR'
}

export function canManagePayroll(role: string | null | undefined): boolean {
  // Payroll is shared between HR and O&A, but does not grant general admin rights.
  return role === 'HR' || role === 'OA'
}

export function canManageSupport(role: string | null | undefined): boolean {
  return role === 'HR' || role === 'SECURITY'
}
