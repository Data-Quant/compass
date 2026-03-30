'use client'

import { cn } from '@/lib/utils'
import { Plutus21Logo } from '@/components/brand/Plutus21Logo'
import { useCompanyBranding } from '@/components/providers/company-branding-provider'

interface CompanyBrandMarkProps {
  className?: string
  size?: number
  variant?: 'light' | 'dark' | 'auto'
}

export function CompanyBrandMark({
  className,
  size = 40,
  variant = 'auto',
}: CompanyBrandMarkProps) {
  const { selectedCompany, branding } = useCompanyBranding()

  if (selectedCompany === 'plutus') {
    return <Plutus21Logo size={size} className={className} variant={variant} />
  }

  return (
    <img
      src={branding.markSrc}
      alt={branding.companyName}
      width={size}
      height={size}
      className={cn('shrink-0 object-contain', className)}
    />
  )
}
