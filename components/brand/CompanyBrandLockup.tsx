'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Plutus21Logo } from '@/components/brand/Plutus21Logo'
import { useCompanyBranding } from '@/components/providers/company-branding-provider'
import threeEMark from '../../public/icons/3e/3e-mark.png'

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
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={selectedCompany}
        initial={{ opacity: 0, y: 4, scale: 0.97, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -4, scale: 0.97, filter: 'blur(8px)' }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className={cn('inline-flex shrink-0 items-center gap-2', className)}
        aria-label={branding.companyName}
        role="img"
      >
        {selectedCompany === 'plutus' ? (
          <Plutus21Logo size={size} variant={variant} />
        ) : (
          <>
            <Image
              src={threeEMark}
              alt="3E"
              width={Math.round(size * 0.9)}
              height={size}
              className="shrink-0 object-contain"
              priority
            />
            <span className="text-[0.7em] font-semibold leading-none opacity-70">x</span>
            <Plutus21Logo size={size} variant={variant} />
          </>
        )}
      </motion.span>
    </AnimatePresence>
  )
}
