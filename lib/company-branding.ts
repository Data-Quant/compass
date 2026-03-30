export type CompanyView = 'plutus' | '3e'

export const COMPANY_COOKIE_NAME = 'selected_company'

export type CompanyBranding = {
  company: CompanyView
  companyName: string
  platformName: string
  title: string
  description: string
  iconLight: string
  iconDark: string
  appleIcon: string
  shortcutIcon: string
  markSrc?: string
  lockupSrc?: string
}

export function normalizeCompanyView(value: string | null | undefined): CompanyView {
  return value?.trim().toLowerCase() === '3e' ? '3e' : 'plutus'
}

export function isThreeEDepartment(department: string | null | undefined) {
  return department?.trim().toLowerCase() === '3e'
}

export function userMatchesCompanyView(
  user: { department?: string | null; role?: string | null },
  company: CompanyView
) {
  if (user.role === 'HR') return true

  const belongsTo3E = isThreeEDepartment(user.department)
  return company === '3e' ? belongsTo3E : !belongsTo3E
}

export function getCompanyBranding(company: CompanyView): CompanyBranding {
  if (company === '3e') {
    return {
      company,
      companyName: '3E x Plutus',
      platformName: 'Compass',
      title: 'Compass | 3E x Plutus',
      description:
        'Your central hub for performance reviews, leave management, and team collaboration at 3E x Plutus.',
      iconLight: '/icons/3e/3e-mark.png',
      iconDark: '/icons/3e/3e-mark.png',
      appleIcon: '/icons/3e/3e-mark.png',
      shortcutIcon: '/icons/3e/3e-mark.png',
      markSrc: '/icons/3e/3e-mark.png',
      lockupSrc: '/icons/3e/3e-lockup.png',
    }
  }

  return {
    company,
    companyName: 'Plutus21',
    platformName: 'Compass',
    title: 'Compass | Plutus21 HR Hub',
    description:
      'Your central hub for performance reviews, leave management, and team collaboration at Plutus21.',
    iconLight: '/icons/plutus21/plutus-light.svg',
    iconDark: '/icons/plutus21/plutus-dark-32.png',
    appleIcon: '/icons/plutus21/plutus-light-180.png',
    shortcutIcon: '/favicon.ico',
  }
}
