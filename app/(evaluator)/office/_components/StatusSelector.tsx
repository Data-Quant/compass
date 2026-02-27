'use client'

import { OFFICE_STATUSES, STATUS_COLORS, type OfficeStatus } from '@/lib/office-config'

interface StatusSelectorProps {
  current: OfficeStatus
  onChange: (status: OfficeStatus) => void
}

const STATUS_LABELS: Record<OfficeStatus, string> = {
  ONLINE: 'Online',
  AWAY: 'Away',
  BUSY: 'Busy',
  DND: 'Do Not Disturb',
}

export function StatusSelector({ current, onChange }: StatusSelectorProps) {
  return (
    <div className="relative inline-flex items-center gap-1.5">
      <div
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: STATUS_COLORS[current] }}
      />
      <select
        value={current}
        onChange={(e) => onChange(e.target.value as OfficeStatus)}
        onKeyDown={(e) => e.stopPropagation()}
        className="bg-transparent text-xs font-medium text-foreground outline-none cursor-pointer appearance-none pr-4"
      >
        {OFFICE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  )
}
