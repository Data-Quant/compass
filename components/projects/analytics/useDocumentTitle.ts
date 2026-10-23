'use client'

import { useEffect } from 'react'

/** Prefix the app's own tab title (set by the root layout metadata) while the page is open. */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = previous ? `${title} | ${previous}` : title
    return () => { document.title = previous }
  }, [title])
}
