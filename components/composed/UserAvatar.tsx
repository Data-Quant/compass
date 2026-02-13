'use client'

import { cn } from '@/lib/utils'

interface UserAvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
}

export function UserAvatar({ name, size = 'md', className }: UserAvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground font-semibold shrink-0',
        sizeClasses[size],
        className
      )}
      title={name}
    >
      {initials}
    </div>
  )
}
