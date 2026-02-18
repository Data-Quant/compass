'use client'

import { Badge } from '@/components/ui/badge'
import { getWarrantyState } from '@/lib/asset-utils'

interface WarrantyBadgeProps {
  warrantyEndDate: string | Date | null | undefined
}

export function WarrantyBadge({ warrantyEndDate }: WarrantyBadgeProps) {
  const state = getWarrantyState(warrantyEndDate || null)

  if (state === 'NONE') {
    return <Badge variant="outline">No Warranty</Badge>
  }

  if (state === 'EXPIRED') {
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">Expired</Badge>
  }

  if (state === 'EXPIRING') {
    return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">Expiring</Badge>
  }

  return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Active</Badge>
}

