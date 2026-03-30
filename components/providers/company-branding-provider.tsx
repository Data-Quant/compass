'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  COMPANY_COOKIE_NAME,
  type CompanyBranding,
  type CompanyView,
  getCompanyBranding,
  normalizeCompanyView,
} from '@/lib/company-branding'

type CompanyBrandingContextValue = {
  selectedCompany: CompanyView
  branding: CompanyBranding
  setSelectedCompany: (company: CompanyView) => void
  clearSelectedCompany: () => void
}

const CompanyBrandingContext = createContext<CompanyBrandingContextValue | null>(null)

const COMPANY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

function writeSelectedCompanyCookie(company: CompanyView) {
  document.cookie = `${COMPANY_COOKIE_NAME}=${company}; Path=/; Max-Age=${COMPANY_COOKIE_MAX_AGE}; SameSite=Lax`
}

function clearSelectedCompanyCookie() {
  document.cookie = `${COMPANY_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function CompanyBrandingProvider({
  initialCompany,
  children,
}: {
  initialCompany: CompanyView
  children: React.ReactNode
}) {
  const [selectedCompany, setSelectedCompanyState] = useState<CompanyView>(
    normalizeCompanyView(initialCompany)
  )

  const setSelectedCompany = useCallback((company: CompanyView) => {
    const normalized = normalizeCompanyView(company)
    setSelectedCompanyState(normalized)
    writeSelectedCompanyCookie(normalized)
  }, [])

  const clearSelectedCompany = useCallback(() => {
    setSelectedCompanyState('plutus')
    clearSelectedCompanyCookie()
  }, [])

  const branding = useMemo(() => getCompanyBranding(selectedCompany), [selectedCompany])

  const value = useMemo(
    () => ({
      selectedCompany,
      branding,
      setSelectedCompany,
      clearSelectedCompany,
    }),
    [selectedCompany, branding, setSelectedCompany, clearSelectedCompany]
  )

  return (
    <CompanyBrandingContext.Provider value={value}>
      {children}
    </CompanyBrandingContext.Provider>
  )
}

export function useCompanyBranding() {
  const context = useContext(CompanyBrandingContext)
  if (!context) {
    throw new Error('useCompanyBranding must be used within CompanyBrandingProvider')
  }
  return context
}
