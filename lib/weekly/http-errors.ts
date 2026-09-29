import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { SameOriginError } from '@/lib/security/same-origin'
import { WeeklyError } from './service/errors'

export function weeklyErrorResponse(error: unknown): NextResponse {
  if (error instanceof WeeklyError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof SameOriginError) return NextResponse.json({ error: error.message }, { status: 403 })
  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message)).join('; ')
    return NextResponse.json({ error: message }, { status: 400 })
  }
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'The request body is not valid JSON' }, { status: 400 })
  console.error('[weekly] unexpected error', error)
  return NextResponse.json({ error: 'Something went wrong. Reload and try again.' }, { status: 500 })
}
