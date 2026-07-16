'use client'

import { useEffect, useRef, useState } from 'react'
import type { TalentGridEntry } from '@/lib/analytics/talent-grid'
import type { NameResolver } from '@/components/analytics/types'
import { createTalentCubeScene, type CubeHandle, type HoverTarget } from './talent-cube-scene'

interface TalentCubeProps {
  entries: TalentGridEntry[]
  resolveName: NameResolver
  onSelect: (employeeId: string) => void
}

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

/**
 * React shell around a vanilla three.js scene. React owns only the container
 * ref and the HTML tooltip; the scene is driven imperatively so no custom React
 * renderer is involved. See talent-cube-scene.ts for why that matters.
 */
export default function TalentCube({ entries, resolveName, onSelect }: TalentCubeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<CubeHandle | null>(null)
  const [hover, setHover] = useState<HoverTarget | null>(null)

  // Latest callbacks without re-creating the scene on every parent render.
  const resolveNameRef = useRef(resolveName)
  const onSelectRef = useRef(onSelect)
  resolveNameRef.current = resolveName
  onSelectRef.current = onSelect

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const handle = createTalentCubeScene({
      container,
      entries,
      resolveName: (id) => resolveNameRef.current(id),
      onHover: setHover,
      onSelect: (id) => onSelectRef.current(id),
      reducedMotion,
      dark: isDarkTheme(),
    })
    handle.setTheme(isDarkTheme())
    handleRef.current = handle

    return () => {
      handle.dispose()
      handleRef.current = null
      setHover(null)
    }
  }, [entries])

  // Keep frame/grid colors in step with the app's theme toggle.
  useEffect(() => {
    const observer = new MutationObserver(() => handleRef.current?.setTheme(isDarkTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[460px] w-full cursor-grab rounded-lg"
        role="img"
        aria-label="3D talent cube plotting performance, momentum and evaluator consensus. A 2D view of the same data is available via the 2D toggle."
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[130%] rounded-lg border border-border bg-card p-3 text-sm text-foreground shadow-lg"
          style={{ left: hover.left, top: hover.top }}
        >
          <div className="font-semibold">{hover.name}</div>
          <div className="mb-2 text-xs text-muted-foreground">
            {hover.entry.department || 'No department'}
            {hover.entry.cellLabel ? ` • ${hover.entry.cellLabel}` : ''}
          </div>
          <div>Performance: {hover.entry.performanceScore.toFixed(1)}%</div>
          <div>
            Momentum:{' '}
            {hover.entry.momentumDelta === null
              ? 'no prior period'
              : `${hover.entry.momentumDelta > 0 ? '+' : ''}${hover.entry.momentumDelta.toFixed(1)} pts`}
          </div>
          <div>
            Consensus:{' '}
            {hover.entry.consensus === null
              ? 'not enough lenses'
              : `${(hover.entry.consensus * 100).toFixed(0)}%`}
          </div>
        </div>
      )}
    </div>
  )
}
