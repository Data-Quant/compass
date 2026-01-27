import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth'

export async function POST() {
  try {
    await clearSession()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Logout failed' },
      { status: 500 }
    )
  }
}
