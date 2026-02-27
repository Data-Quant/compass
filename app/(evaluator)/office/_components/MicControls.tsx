'use client'

import { useEffect } from 'react'
import { Mic, MicOff, Radio } from 'lucide-react'
import type { AudioZone } from '@/lib/office-config'

interface MicControlsProps {
  isConnected: boolean
  isMuted: boolean
  isPushToTalk: boolean
  masterVolume: number
  currentZone: AudioZone | null
  onToggleMic: () => void
  onSetMasterVolume: (v: number) => void
  onSetPushToTalk: (on: boolean) => void
  onStartPushToTalk: () => void
  onStopPushToTalk: () => void
}

export function MicControls({
  isConnected,
  isMuted,
  isPushToTalk,
  masterVolume,
  currentZone,
  onToggleMic,
  onSetMasterVolume,
  onSetPushToTalk,
  onStartPushToTalk,
  onStopPushToTalk,
}: MicControlsProps) {
  // V key for push-to-talk
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === 'KeyV' && !e.repeat) {
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
        onStartPushToTalk()
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === 'KeyV') {
        onStopPushToTalk()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [onStartPushToTalk, onStopPushToTalk])

  if (!isConnected) return null

  return (
    <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-lg bg-card/90 backdrop-blur-sm border border-border px-3 py-2 shadow-lg">
      {/* Zone indicator */}
      {currentZone && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400 mr-1">
          <Radio className="h-3 w-3" />
          <span>{currentZone.label}</span>
        </div>
      )}

      {/* Volume slider */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={masterVolume}
        onChange={(e) => onSetMasterVolume(parseFloat(e.target.value))}
        className="w-16 h-1 accent-primary cursor-pointer"
        title={`Volume: ${Math.round(masterVolume * 100)}%`}
      />

      {/* PTT toggle */}
      <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none" title="Push-to-talk (hold V)">
        <input
          type="checkbox"
          checked={isPushToTalk}
          onChange={(e) => onSetPushToTalk(e.target.checked)}
          className="h-3 w-3 accent-primary"
        />
        <span>PTT</span>
      </label>

      {/* Mic toggle button */}
      <button
        onClick={onToggleMic}
        className={`p-1.5 rounded-md transition-colors ${
          isMuted
            ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
            : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
        }`}
        title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>
    </div>
  )
}
