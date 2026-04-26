'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  X,
  Monitor,
  Palette,
  ClipboardList,
  CalendarDays,
  BarChart3,
  Network,
  User,
  HomeIcon,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  DECOR_DESK_ITEMS,
  DECOR_THEMES,
  DECOR_WALL_ITEMS,
  decorThemeTint,
  type DecorChoices,
  type DecorDeskItem,
  type DecorTheme,
  type DecorWallItem,
} from '@/shared/office-world'

interface MyDeskPanelProps {
  open: boolean
  onClose: () => void
  scope: 'cubicle' | 'lead-office' | 'partner-office'
  initialDecor: DecorChoices
  onDecorSaved: (decor: DecorChoices) => void
}

const QUICK_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: HomeIcon, accent: 'text-emerald-300' },
  { href: '/dashboard?tab=evaluations', label: 'Evaluations', icon: ClipboardList, accent: 'text-blue-300' },
  { href: '/leave', label: 'Leave', icon: CalendarDays, accent: 'text-purple-300' },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3, accent: 'text-amber-300' },
  { href: '/admin/org-chart', label: 'Org Chart', icon: Network, accent: 'text-cyan-300' },
  { href: '/profile', label: 'Profile', icon: User, accent: 'text-pink-300' },
] as const

const THEME_LABELS: Record<DecorTheme, string> = {
  'plutus-blue': 'Plutus Blue',
  'deep-focus': 'Deep Focus',
  'warm-wood': 'Warm Wood',
  'clean-slate': 'Clean Slate',
}

const DESK_ITEM_LABELS: Record<DecorDeskItem, string> = {
  plant: '🪴 Plant',
  notebook: '📓 Notebook',
  coffee: '☕ Coffee',
  award: '🏆 Award',
}

const WALL_ITEM_LABELS: Record<DecorWallItem, string> = {
  'plutus-poster': '🎯 Plutus21 Poster',
  'team-photo': '📸 Team Photo',
  whiteboard: '📋 Whiteboard',
  'market-chart': '📈 Market Chart',
}

export function MyDeskPanel({ open, onClose, scope, initialDecor, onDecorSaved }: MyDeskPanelProps) {
  const [tab, setTab] = useState<'computer' | 'decorate'>('computer')
  const [theme, setTheme] = useState<DecorTheme>(initialDecor.theme)
  const [deskItems, setDeskItems] = useState<DecorDeskItem[]>(initialDecor.deskItems)
  const [wallItem, setWallItem] = useState<DecorWallItem | null>(initialDecor.wallItem)
  const [saving, setSaving] = useState(false)

  // Reset local state when the panel opens with a different starting decor.
  useEffect(() => {
    if (open) {
      setTheme(initialDecor.theme)
      setDeskItems(initialDecor.deskItems)
      setWallItem(initialDecor.wallItem)
    }
  }, [open, initialDecor])

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const tint = decorThemeTint(theme)
  const scopeLabel = scope === 'cubicle' ? 'Your Desk' : scope === 'lead-office' ? 'Your Lead Office' : 'Your Partner Office'

  const toggleDeskItem = (item: DecorDeskItem) => {
    setDeskItems((prev) => {
      if (prev.includes(item)) return prev.filter((i) => i !== item)
      if (prev.length >= 3) {
        toast.info('Pick up to 3 desk items')
        return prev
      }
      return [...prev, item]
    })
  }

  const handleSaveDecor = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/office/decor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, deskItems, wallItem }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save decor')
      toast.success('Decor updated — others will see the change next time they enter the office.')
      onDecorSaved({ theme, deskItems, wallItem })
    } catch (e: any) {
      toast.error(e.message || 'Failed to save decor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-md border border-white/10 bg-[#0b0f19] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded"
              style={{ backgroundColor: tint.primary }}
            >
              <Monitor className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">{scopeLabel}</h2>
              <p className="text-xs text-slate-400">Personal computer · {THEME_LABELS[theme]}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setTab('computer')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors ${
              tab === 'computer'
                ? 'border-b-2 border-blue-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Monitor className="h-4 w-4" /> Computer
          </button>
          <button
            onClick={() => setTab('decorate')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors ${
              tab === 'decorate'
                ? 'border-b-2 border-blue-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Palette className="h-4 w-4" /> Decorate
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 max-h-[70vh] overflow-y-auto">
          {tab === 'computer' && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {QUICK_LINKS.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onClose}
                    className="group flex flex-col items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/10"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-white/[0.06] group-hover:bg-white/15">
                      <Icon className={`h-5 w-5 ${link.accent}`} />
                    </div>
                    <div className="text-xs font-medium text-white">{link.label}</div>
                  </Link>
                )
              })}
            </div>
          )}

          {tab === 'decorate' && (
            <div className="space-y-5">
              {/* Theme */}
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Theme</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {DECOR_THEMES.map((t) => {
                    const c = decorThemeTint(t)
                    const active = theme === t
                    return (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={`group rounded-md border p-3 transition-all ${
                          active
                            ? 'border-blue-500 bg-white/10'
                            : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                        }`}
                      >
                        <div className="mb-2 flex gap-1">
                          <div className="h-6 flex-1 rounded" style={{ backgroundColor: c.primary }} />
                          <div className="h-6 flex-1 rounded" style={{ backgroundColor: c.accent }} />
                        </div>
                        <div className="text-xs font-medium text-white">{THEME_LABELS[t]}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Desk items */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Desk Items</span>
                  <span className="text-[11px] text-slate-500">Pick up to 3 · {deskItems.length}/3</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {DECOR_DESK_ITEMS.map((item) => {
                    const active = deskItems.includes(item)
                    return (
                      <button
                        key={item}
                        onClick={() => toggleDeskItem(item)}
                        className={`rounded-md border px-3 py-2.5 text-left transition-all ${
                          active
                            ? 'border-blue-500 bg-blue-500/15 text-white'
                            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]'
                        }`}
                      >
                        <div className="text-sm">{DESK_ITEM_LABELS[item]}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Wall item */}
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Wall Poster</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button
                    onClick={() => setWallItem(null)}
                    className={`rounded-md border px-3 py-2.5 text-left transition-all ${
                      wallItem === null
                        ? 'border-blue-500 bg-blue-500/15 text-white'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="text-sm">— None —</div>
                  </button>
                  {DECOR_WALL_ITEMS.map((w) => {
                    const active = wallItem === w
                    return (
                      <button
                        key={w}
                        onClick={() => setWallItem(w)}
                        className={`rounded-md border px-3 py-2.5 text-left transition-all ${
                          active
                            ? 'border-blue-500 bg-blue-500/15 text-white'
                            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]'
                        }`}
                      >
                        <div className="text-sm">{WALL_ITEM_LABELS[w]}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Save */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveDecor}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {saving ? 'Saving…' : 'Save decor'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
