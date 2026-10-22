'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

// True while the element has content hidden past its right edge.
export function useScrollEdge(ref: React.RefObject<HTMLElement | null>) {
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const check = () => setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 1)
    check()
    node.addEventListener('scroll', check, { passive: true })
    const observer = new ResizeObserver(check)
    observer.observe(node)
    // Adding or removing a column changes scrollWidth without resizing the row itself.
    const mutations = new MutationObserver(check)
    mutations.observe(node, { childList: true })
    return () => {
      node.removeEventListener('scroll', check)
      observer.disconnect()
      mutations.disconnect()
    }
  }, [ref])

  return canScrollRight
}

// Horizontal row of columns. macOS hides scrollbars, so the right fade shows there is more.
export function BoardScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const canScrollRight = useScrollEdge(ref)
  return (
    <div className="relative">
      <div ref={ref} className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]">
        {children}
      </div>
      <div
        aria-hidden
        hidden={!canScrollRight}
        className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent"
      />
    </div>
  )
}

interface BoardColumnShellProps {
  id: string
  name: string
  color: string
  description?: string
  count: number
  isOver: boolean
  dropRef: (node: HTMLElement | null) => void
  headerStart?: React.ReactNode
  headerEnd?: React.ReactNode
  top?: React.ReactNode
  children: React.ReactNode
  outerRef?: (node: HTMLElement | null) => void
  style?: React.CSSProperties
  className?: string
}

export function BoardColumnShell({
  id,
  name,
  color,
  description,
  count,
  isOver,
  dropRef,
  headerStart,
  headerEnd,
  top,
  children,
  outerRef,
  style,
  className,
}: BoardColumnShellProps) {
  return (
    <section
      ref={outerRef}
      style={style}
      aria-labelledby={`board-column-${id}`}
      className={cn('flex w-[288px] shrink-0 flex-col', className)}
    >
      <div className="group/col flex h-9 items-center gap-2 px-1">
        {headerStart}
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <h2 id={`board-column-${id}`} title={description} className="truncate text-sm font-medium">{name}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        {headerEnd && <div className="ml-auto flex items-center">{headerEnd}</div>}
      </div>
      <div
        ref={dropRef}
        className={cn(
          'min-h-[420px] flex-1 space-y-1.5 rounded-xl border border-transparent bg-muted/60 p-1.5 transition-colors dark:bg-muted/30',
          isOver && 'border-primary/40 bg-primary/[0.05] dark:bg-primary/[0.05]',
        )}
      >
        {top}
        {children}
      </div>
    </section>
  )
}

export function BoardColumnEmpty() {
  return <div className="py-8 text-center text-xs text-muted-foreground">Drop tasks here</div>
}

export function AddTaskButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Plus className="h-3.5 w-3.5" />
      Add task
    </button>
  )
}

export const TASK_NAME_INPUT_CLASS =
  'h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15'
