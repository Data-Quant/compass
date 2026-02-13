'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingScreen } from '@/components/composed/LoadingScreen'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
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

  return <LoadingScreen message="Redirecting..." />
}
