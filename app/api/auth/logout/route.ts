import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth'
import { COMPANY_COOKIE_NAME } from '@/lib/company-branding'

export async function POST() {
  try {
    await clearSession()
    const response = NextResponse.json({ success: true })
    response.cookies.set(COMPANY_COOKIE_NAME, '', {
      path: '/',
      maxAge: 0,
    })
    return response
  } catch (error) {
    console.error('Logout failed:', error)
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    )
  }
}
