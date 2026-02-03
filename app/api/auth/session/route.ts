import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 })
    }
    return NextResponse.json({ user })
  } catch (error) {
    console.error('Failed to get session:', error)
    return NextResponse.json(
      { error: 'Failed to get session' },
      { status: 500 }
    )
  }
}
