'use client'

import { useEffect, useState } from 'react'
import type { SecurityCapabilities } from '@/lib/security-checks/access'
import { scRequest } from '../sc-api'

export interface ScMe {
  enabled: boolean
  capabilities?: SecurityCapabilities
  actionable?: number
  unread?: number
}

/** The viewer's Security Checks capabilities (UI hints only — the server enforces access). */
export function useScMe(): ScMe | null {
  const [me, setMe] = useState<ScMe | null>(null)
  useEffect(() => {
    scRequest<ScMe>('/api/security-checks/me')
      .then(setMe)
      .catch(() => setMe({ enabled: false }))
  }, [])
  return me
}
