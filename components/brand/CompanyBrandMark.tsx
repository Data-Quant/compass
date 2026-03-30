'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Plutus21Logo } from '@/components/brand/Plutus21Logo'
import { useCompanyBranding } from '@/components/providers/company-branding-provider'
import threeEMark from '../../public/icons/3e/3e-mark.png'

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
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={selectedCompany}
        initial={{ opacity: 0, y: 4, scale: 0.96, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -4, scale: 0.96, filter: 'blur(6px)' }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="inline-flex shrink-0"
      >
        {selectedCompany === 'plutus' ? (
          <Plutus21Logo size={size} className={className} variant={variant} />
        ) : (
          <Image
            src={threeEMark}
            alt={branding.companyName}
            width={size}
            height={size}
            className={cn('shrink-0 object-contain', className)}
            priority
          />
        )}
      </motion.span>
    </AnimatePresence>
  )
}
