'use client'

import { motion } from 'framer-motion'
import { PLATFORM_NAME, COMPANY_NAME } from '@/lib/config'

export function PageFooter() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="mt-16 pb-8 flex items-center justify-center gap-2 text-xs text-muted"
    >
      <span>Powered by {COMPANY_NAME}</span>
      <span>•</span>
      <span>Crafted by</span>
      <span className="font-medium">AHK</span>
    </motion.div>
  )
}
