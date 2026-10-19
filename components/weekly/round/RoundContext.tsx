'use client'

import { createContext, useContext } from 'react'

/** Inside the Evaluation round page, every tab works on the round's cycle and hides its own cycle picker. */
export const RoundCycleContext = createContext<string | null>(null)

export function useRoundCycle(): string | null {
  return useContext(RoundCycleContext)
}
