'use client'

import { Info } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface StatTileProps {
  label: string
  value: string
  unit?: string
  sub: string
  definition: string
}

export function StatTile({ label, value, unit, sub, definition }: StatTileProps) {
  return (
    <Card className="flex min-w-0 flex-col gap-1.5 p-4">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`How ${label} is counted`}
              className="rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] border border-border bg-popover text-popover-foreground shadow-lg">
            {definition}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </Card>
  )
}

export function StatTileGrid({ tiles }: { tiles: StatTileProps[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => <StatTile key={tile.label} {...tile} />)}
    </div>
  )
}
