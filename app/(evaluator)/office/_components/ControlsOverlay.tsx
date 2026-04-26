'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

export function ControlsOverlay() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur border border-border rounded-lg px-4 py-3 shadow-lg z-20 max-w-[220px]">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="text-xs font-medium text-foreground mb-2">Controls</p>
      <div className="space-y-1.5 text-[10px] text-muted-foreground">
        <p><kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">W A S D</kbd> / <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">↑ ← ↓ →</kbd> — move</p>
        <p><kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">V</kbd> — push-to-talk (hold)</p>
        <p><kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">E</kbd> — open your computer at your desk</p>
        <p><kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">Esc</kbd> — close popups</p>
        <p><kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">Mouse wheel</kbd> — zoom</p>
      </div>
    </div>
  )
}
