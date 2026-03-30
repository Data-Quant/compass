'use client'

import { cn } from '@/lib/utils'
import { Plutus21Logo } from '@/components/brand/Plutus21Logo'
import { useCompanyBranding } from '@/components/providers/company-branding-provider'

interface CompanyBrandLockupProps {
  className?: string
  size?: number
  variant?: 'light' | 'dark' | 'auto'
}

export function CompanyBrandLockup({
  className,
  size = 32,
  variant = 'auto',
}: CompanyBrandLockupProps) {
  const { selectedCompany, branding } = useCompanyBranding()

  if (selectedCompany === 'plutus') {
    return <Plutus21Logo size={size} className={className} variant={variant} />
  }

  return (
    <div
      className={cn('inline-flex shrink-0 items-center gap-2', className)}
      aria-label={branding.companyName}
      role="img"
    >
      <img
        src={branding.markSrc}
        alt="3E"
        width={Math.round(size * 0.9)}
        height={size}
        className="shrink-0 object-contain"
      />
      <span className="text-[0.7em] font-semibold leading-none opacity-70">x</span>
      <Plutus21Logo size={size} variant={variant} />
    </div>
  )
}
