import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { setSession } from '@/lib/auth'
import {
  checkRateLimit,
  normalizeClientIp,
  RateLimitUnavailableError,
  retryAfterSeconds,
} from '@/lib/rate-limit'
import { verifyCsrfToken } from '@/lib/csrf'
import {
  COMPANY_COOKIE_NAME,
  isThreeEDepartment,
  type CompanyView,
} from '@/lib/company-branding'
import bcrypt from 'bcryptjs'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COMPANY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

function rateLimitResponse(resetAt: Date) {
  return NextResponse.json(
    { error: 'Too many login attempts. Please try again later.' },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds(resetAt)) },
    }
  )
}

function logLoginFailure(reason: string, context: { ip: string; email?: string }) {
  // Structured warning so it's grep-able in Vercel logs for auth-abuse triage.
  console.warn('[login-fail]', JSON.stringify({ reason, ...context, at: new Date().toISOString() }))
}

export async function POST(request: NextRequest) {
  const ip = normalizeClientIp(
    request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
  )

  try {
    if (!verifyCsrfToken(request)) {
      logLoginFailure('csrf_invalid', { ip })
      return NextResponse.json({ error: 'Invalid request' }, { status: 403 })
    }

    // Fail-closed: if the rate-limit backend is unavailable, reject login
    // rather than letting attempts through uncounted. Other endpoints that
    // call checkRateLimit may choose to fail open; login must not.
    let ipLimit
    try {
      ipLimit = await checkRateLimit(`login:ip:${ip}`, 20)
    } catch (err) {
      if (err instanceof RateLimitUnavailableError) {
        logLoginFailure('rate_limit_unavailable', { ip })
        return NextResponse.json(
          { error: 'Authentication temporarily unavailable. Please try again shortly.' },
          { status: 503, headers: { 'Retry-After': '30' } }
        )
      }
      throw err
    }
    if (!ipLimit.allowed) {
      logLoginFailure('ip_rate_limited', { ip })
      return rateLimitResponse(ipLimit.resetAt)
    }

    const { email, password } = await request.json()

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    let accountLimit
    try {
      accountLimit = await checkRateLimit(`login:account:${normalizedEmail}`, 10)
    } catch (err) {
      if (err instanceof RateLimitUnavailableError) {
        logLoginFailure('rate_limit_unavailable', { ip, email: normalizedEmail })
        return NextResponse.json(
          { error: 'Authentication temporarily unavailable. Please try again shortly.' },
          { status: 503, headers: { 'Retry-After': '30' } }
        )
      }
      throw err
    }
    if (!accountLimit.allowed) {
      logLoginFailure('account_rate_limited', { ip, email: normalizedEmail })
      return rateLimitResponse(accountLimit.resetAt)
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { payrollProfile: { is: null } },
          { payrollProfile: { is: { isPayrollActive: true } } },
        ],
        email: { equals: normalizedEmail, mode: 'insensitive' },
      },
    })

    const invalidResponse = NextResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    )

    if (!user || !user.passwordHash) {
      // Equal-time path to reduce user enumeration via response timing.
      await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv')
      logLoginFailure(user ? 'no_password_set' : 'unknown_email', { ip, email: normalizedEmail })
      return invalidResponse
    }

    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) {
      logLoginFailure('bad_password', { ip, email: normalizedEmail })
      return invalidResponse
    }

    await setSession(user.id)

    const company: CompanyView = isThreeEDepartment(user.department) ? '3e' : 'plutus'

    const response = NextResponse.json({
      success: true,
      user: {
        name: user.name,
        department: user.department,
        position: user.position,
        role: user.role,
      },
      company,
    })

    response.cookies.set(COMPANY_COOKIE_NAME, company, {
      path: '/',
      sameSite: 'lax',
      maxAge: COMPANY_COOKIE_MAX_AGE,
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
