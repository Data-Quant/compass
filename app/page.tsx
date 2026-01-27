'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // Check if user is logged in
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          router.push('/dashboard')
        } else {
          router.push('/login')
        }
      })
      .catch(() => router.push('/login'))
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-lg">Loading...</div>
    </div>
  )
}
