'use client'

import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from '@/components/providers/theme-provider'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const icon =
    theme === 'system' ? (
      <Monitor className="h-4 w-4" />
    ) : resolvedTheme === 'dark' ? (
      <Moon className="h-4 w-4" />
    ) : (
      <Sun className="h-4 w-4" />
    )

  const label =
    theme === 'system'
      ? 'System'
      : theme === 'dark'
        ? 'Dark'
        : 'Light'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            aria-label={`Theme: ${label}. Click to switch.`}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Theme: {label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
