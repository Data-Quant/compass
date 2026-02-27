'use client'

import { STATUS_COLORS, type OfficeStatus } from '@/lib/office-config'

interface PlayerData {
  userId: string
  name: string
  department: string
  position: string
  status: string
}

interface PlayerListProps {
  players: PlayerData[]
}

export function PlayerList({ players }: PlayerListProps) {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <h3 className="text-xs font-semibold text-foreground">
          Online <span className="text-muted-foreground font-normal">({players.length})</span>
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {sorted.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No one online</p>
        )}
        {sorted.map((player) => {
          const statusColor = STATUS_COLORS[player.status as OfficeStatus] || STATUS_COLORS.ONLINE
          return (
            <div key={player.userId} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50 transition-colors">
              <div
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: statusColor }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{player.name}</p>
                {player.department && (
                  <p className="text-[10px] text-muted-foreground truncate">{player.department}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
