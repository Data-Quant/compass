'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PeriodSwitcherProps {
  label: string
  onPrevious: () => void
  onNext: () => void
}

export function PeriodSwitcher({ label, onPrevious, onNext }: PeriodSwitcherProps) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Previous" onClick={onPrevious}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[9rem] text-center font-medium">{label}</span>
      <Button variant="outline" size="icon" aria-label="Next" onClick={onNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
