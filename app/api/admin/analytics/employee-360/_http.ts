import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  Vary: 'Cookie',
} as const

export function employee360Json(
  body: unknown,
  init: { status?: number } = {}
) {
  return NextResponse.json(body, {
    status: init.status,
    headers: PRIVATE_HEADERS,
  })
}

export async function requireEmployee360Hr() {
  const user = await getSession()
  return user && isAdminRole(user.role) ? user : null
}
