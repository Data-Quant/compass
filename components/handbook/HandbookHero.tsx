'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { BackgroundBeams } from '@/components/aceternity/background-beams'

export function HandbookHero({
  firstName,
  teamLabel,
  query,
  onQueryChange,
}: {
  firstName: string | null
  teamLabel: string | null
  query: string
  onQueryChange: (q: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Cmd/Ctrl+K focuses search -- the returning employee's fast path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-card border border-border bg-card p-8 sm:p-10 mb-8"
    >
      {/* opacity-70 in light: 40% of a faint violet over a white card is invisible. */}
      <BackgroundBeams className="opacity-70 dark:opacity-20" />

      <div className="relative">
        {/* The label always renders -- it and the rule are one editorial unit, and
            omitting it for untagged users left the rule orphaned above the greeting.
            Untagged is the state every employee starts in, so it is not an edge case. */}
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {teamLabel ? `Plutus21 · ${teamLabel}` : 'Plutus21'}
        </p>
        <div className="h-px w-full max-w-xs bg-gradient-to-r from-primary/60 to-transparent my-3.5" />

        <h1 className="text-3xl sm:text-4xl font-display font-light tracking-tight text-foreground">
          {firstName ? (
            <>
              Welcome to Plutus21, <span className="gradient-text">{firstName}</span>.
            </>
          ) : (
            <>
              The <span className="gradient-text">Handbook</span>
            </>
          )}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Everything about how we work — the policies, the benefits, the people.
        </p>

        <div className="relative mt-6 max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search the handbook — leave, hours, benefits…"
            aria-label="Search the handbook"
            className="w-full rounded-button border border-border bg-background/80 py-2.5 pl-10 pr-14 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </div>
    </motion.div>
  )
}
