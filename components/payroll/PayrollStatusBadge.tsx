'use client'

import { Badge } from '@/components/ui/badge'

type PayrollStatus =
  | 'DRAFT'
  | 'CALCULATED'
  | 'APPROVED'
  | 'SENDING'
  | 'SENT'
  | 'PARTIAL'
  | 'FAILED'
  | 'LOCKED'

const STATUS_CLASS: Record<PayrollStatus, string> = {
  DRAFT: 'bg-slate-500/15 text-slate-700 border-slate-300',
  CALCULATED: 'bg-blue-500/15 text-blue-700 border-blue-300',
  APPROVED: 'bg-emerald-500/15 text-emerald-700 border-emerald-300',
  SENDING: 'bg-amber-500/15 text-amber-700 border-amber-300',
  SENT: 'bg-green-500/15 text-green-700 border-green-300',
  PARTIAL: 'bg-orange-500/15 text-orange-700 border-orange-300',
  FAILED: 'bg-red-500/15 text-red-700 border-red-300',
  LOCKED: 'bg-zinc-500/15 text-zinc-700 border-zinc-300',
}

interface PayrollStatusBadgeProps {
  status: string
}

export function PayrollStatusBadge({ status }: PayrollStatusBadgeProps) {
  const normalized = (status || 'DRAFT').toUpperCase() as PayrollStatus
  const className = STATUS_CLASS[normalized] || STATUS_CLASS.DRAFT

  return (
    <Badge variant="outline" className={className}>
      {normalized}
    </Badge>
  )
}
