'use client'

import { motion } from 'framer-motion'
import { useCompanyBranding } from '@/components/providers/company-branding-provider'

export function PageFooter() {
  const { branding } = useCompanyBranding()

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="mt-16 pb-8 flex items-center justify-center gap-2 text-xs text-muted"
    >
      <span>Powered by {branding.companyName}</span>
    </motion.div>
  )
}
