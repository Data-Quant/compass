'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { CompanyBrandLockup } from '@/components/brand/CompanyBrandLockup'
import { useCompanyBranding } from '@/components/providers/company-branding-provider'
import { BackgroundBeams } from '@/components/aceternity/background-beams'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import { Lock, Eye, EyeOff, Mail } from 'lucide-react'

/* ─── Design-system easing curves ─── */
const ease = {
  smooth: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
  spring: { type: 'spring' as const, stiffness: 260, damping: 20, mass: 1 },
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ────────────────────────────────────────────
 * Animated Compass SVG – plays once on splash
 * ──────────────────────────────────────────── */
function CompassHero({ size = 120 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <motion.svg
        viewBox="0 0 120 120"
        className="absolute inset-0 w-full h-full"
        initial={{ opacity: 0, scale: 0.6, rotate: -90 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 1, ease: ease.out }}
      >
        <motion.circle
          cx="60"
          cy="60"
          r="56"
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="1.5"
          strokeDasharray="352"
          strokeDashoffset="352"
          strokeLinecap="round"
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 1.5, ease: 'easeInOut', delay: 0.2 }}
        />
        {[0, 90, 180, 270].map((angle) => (
          <motion.line
            key={angle}
            x1="60" y1="8" x2="60" y2="16"
            stroke="hsl(var(--primary))"
            strokeWidth="1.5"
            strokeLinecap="round"
            transform={`rotate(${angle} 60 60)`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 0.8 + angle / 1000 }}
          />
        ))}
        {[45, 135, 225, 315].map((angle) => (
          <motion.line
            key={angle}
            x1="60" y1="10" x2="60" y2="14"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth="0.75"
            strokeLinecap="round"
            transform={`rotate(${angle} 60 60)`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.25 }}
            transition={{ delay: 1 + angle / 1000 }}
          />
        ))}
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="50%" stopColor="hsl(var(--secondary))" />
            <stop offset="100%" stopColor="hsl(var(--accent))" />
          </linearGradient>
        </defs>
      </motion.svg>

      <motion.svg
        viewBox="0 0 120 120"
        className="absolute inset-0 w-full h-full"
        initial={{ rotate: -180 }}
        animate={{ rotate: [null, 30, -15, 8, -3, 0] }}
        transition={{ duration: 2, ease: 'easeOut', delay: 0.5 }}
      >
        <polygon
          points="60,18 56.5,58 63.5,58"
          fill="url(#needleN)"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(99, 102, 241, 0.3))' }}
        />
        <polygon points="60,102 56.5,62 63.5,62" fill="url(#needleS)" />
        <circle cx="60" cy="60" r="4.5" fill="hsl(var(--primary))" style={{ filter: 'drop-shadow(0 0 6px rgba(99, 102, 241, 0.4))' }} />
        <circle cx="60" cy="60" r="2" fill="hsl(var(--background))" />
        <defs>
          <linearGradient id="needleN" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--accent))" />
          </linearGradient>
          <linearGradient id="needleS" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity="0.5" />
            <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.2" />
          </linearGradient>
        </defs>
      </motion.svg>

      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, hsla(var(--primary), 0.12) 0%, transparent 70%)',
        }}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [1, 1.4, 1.2], opacity: [0, 0.5, 0] }}
        transition={{ duration: 2, delay: 1.2, ease: 'easeOut' }}
      />
    </div>
  )
}

function SplashScreen({
  onComplete,
  platformName,
  companyName,
}: {
  onComplete: () => void
  platformName: string
  companyName: string
}) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2200)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
      exit={{ opacity: 0, filter: 'blur(8px)', scale: 0.98 }}
      transition={{ duration: 0.5, ease: ease.smooth }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, hsla(239, 84%, 67%, 0.06) 0%, transparent 70%)',
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </div>

      <div className="relative flex flex-col items-center">
        <CompassHero size={130} />
        <motion.div
          className="mt-10 flex items-center gap-4"
          initial={{ opacity: 0, filter: 'blur(10px)', y: 16 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{ delay: 1.1, duration: 0.6, ease: ease.smooth }}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.4, ...ease.spring }}
          >
            <CompanyBrandLockup
              size={36}
              className="text-[#2F80ED] dark:text-foreground"
            />
          </motion.div>

          <motion.div
            className="h-7 w-px bg-border/60"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 1.4, duration: 0.3 }}
          />

          <motion.span
            className="text-2xl font-display tracking-tight text-foreground"
            initial={{ opacity: 0, filter: 'blur(8px)', x: -8 }}
            animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
            transition={{ delay: 1.5, duration: 0.5, ease: ease.smooth }}
          >
            {platformName}
          </motion.span>
        </motion.div>

        <motion.p
          className="mt-3 text-sm text-muted-foreground tracking-wide"
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ delay: 1.9, duration: 0.5, ease: ease.smooth }}
        >
          {companyName} Performance Platform
        </motion.p>
      </div>
    </motion.div>
  )
}

/* ────────────────────────────────────────────
 * Main Login Page
 * ──────────────────────────────────────────── */
export default function LoginPage() {
  const router = useRouter()
  const { branding } = useCompanyBranding()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [csrfToken, setCsrfToken] = useState('')

  useEffect(() => {
    setMounted(true)

    // Fetch a CSRF token; the endpoint also sets a matching cookie.
    fetch('/api/auth/csrf')
      .then((r) => r.json())
      .then((data: { token?: string }) => {
        if (data?.token) setCsrfToken(data.token)
      })
      .catch(() => {
        // If CSRF bootstrap fails the user will see a 403 on submit; don't block the UI here.
      })
  }, [])

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false)
  }, [])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loggingIn) return
    setLoggingIn(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })
      const data = await response.json()
      if (data.success) {
        toast.success('Welcome back')
        router.push('/dashboard')
      } else if (response.status === 429) {
        toast.error('Too many login attempts. Please try again later.')
      } else {
        toast.error(data.error || 'Login failed')
      }
    } catch {
      toast.error('Login failed')
    } finally {
      setLoggingIn(false)
    }
  }

  const canSubmit =
    EMAIL_REGEX.test(email.trim()) && password.length > 0 && csrfToken.length > 0

  if (!mounted) return null
  const splashVisible = showSplash

  return (
    <>
      <AnimatePresence>
        {splashVisible && (
          <SplashScreen
            onComplete={handleSplashComplete}
            platformName={branding.platformName}
            companyName={branding.companyName}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="min-h-screen relative overflow-hidden bg-background"
        initial={{ opacity: 0, filter: 'blur(12px)' }}
        animate={{
          opacity: splashVisible ? 0 : 1,
          filter: splashVisible ? 'blur(12px)' : 'blur(0px)',
        }}
        transition={{ duration: 0.6, ease: ease.smooth }}
      >
        <BackgroundBeams className="opacity-40 dark:opacity-20" />

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-indigo-500/10 via-transparent to-transparent dark:from-indigo-500/5" />
          <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-radial from-purple-500/10 via-transparent to-transparent dark:from-purple-500/5" />
        </div>

        <div className="absolute top-6 right-6 z-10">
          <ThemeToggle />
        </div>

        <div className="relative z-10 min-h-screen flex">
          {/* Left side — Branding panel */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: ease.smooth }}
            className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
          >
            <motion.div
              initial={{ opacity: 0, filter: 'blur(8px)', y: 12 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: ease.smooth }}
              className="flex items-center gap-4"
            >
              <CompanyBrandLockup size={36} className="text-[#2F80ED] dark:text-foreground" />
              <div className="h-7 w-px bg-border/60" />
              <span className="text-xl font-display tracking-tight text-foreground">
                {branding.platformName}
              </span>
            </motion.div>

            <div className="max-w-md">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5, ease: ease.smooth }}
                className="mb-8"
              >
                <CompassHero size={72} />
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, filter: 'blur(10px)', y: 16 }}
                animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                transition={{ delay: 0.4, duration: 0.5, ease: ease.smooth }}
                className="text-[42px] font-display leading-tight mb-6"
              >
                <span className="gradient-text">Navigate</span>{' '}
                <span className="text-foreground">your growth</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, x: -48, filter: 'blur(8px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.34, ease: ease.smooth }}
                className="text-lg text-muted-foreground leading-relaxed"
              >
                Performance reviews, leave management, and team collaboration -
                everything you need to thrive at {branding.companyName}.
              </motion.p>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="flex items-center gap-2 text-xs text-muted-foreground/40"
            >
              <span>Crafted by</span>
              <span className="font-medium text-muted-foreground/60">AHK</span>
            </motion.div>
          </motion.div>

          {/* Right side — Login form */}
          <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
            <motion.div
              initial={{ opacity: 0, filter: 'blur(8px)', y: 16 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: ease.smooth }}
              className="w-full max-w-md"
            >
              <div className="lg:hidden text-center mb-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <CompanyBrandLockup size={32} className="text-[#2F80ED] dark:text-foreground" />
                  <span className="text-xl font-display tracking-tight">
                    {branding.platformName}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {branding.companyName} Performance Platform
                </p>
              </div>

              <Card className="rounded-card border-border/50 shadow-premium">
                <CardContent className="p-8">
                  <div className="mb-8">
                    <h2 className="text-2xl font-display text-foreground mb-2">
                      Welcome back
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Sign in with your work email and password
                    </p>
                  </div>

                  <form onSubmit={handleSignIn}>
                    <div className="mb-4 space-y-2">
                      <Label htmlFor="email" className="flex items-center gap-1 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" />
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        autoComplete="email"
                        autoFocus
                      />
                    </div>

                    <div className="mb-6 space-y-2">
                      <Label htmlFor="password" className="flex items-center gap-1 text-muted-foreground">
                        <Lock className="w-3.5 h-3.5" />
                        Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          className="pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <ShimmerButton
                      type="submit"
                      disabled={loggingIn || !canSubmit}
                      className="w-full disabled:opacity-50"
                    >
                      {loggingIn ? (
                        <>
                          <div className="w-4 h-4 spinner" />
                          Signing in...
                        </>
                      ) : (
                        'Sign In'
                      )}
                    </ShimmerButton>
                  </form>

                  <p className="text-xs text-center text-muted-foreground mt-6">
                    First time signing in or forgot your password? Contact HR.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </>
  )
}
