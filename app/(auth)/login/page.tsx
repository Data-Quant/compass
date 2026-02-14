'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BackgroundBeams } from '@/components/aceternity/background-beams'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { Plutus21Logo } from '@/components/brand/Plutus21Logo'
import {
  Search,
  Users,
  AlertCircle,
  ChevronRight,
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react'
import { PLATFORM_NAME, COMPANY_NAME } from '@/lib/config'

interface User {
  id: string
  name: string
  department?: string
  position?: string
  role: string
  hasPassword?: boolean
}

/* ─── Design-system easing curves ─── */
const ease = {
  smooth: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
  spring: { type: 'spring' as const, stiffness: 260, damping: 20, mass: 1 },
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
}

/* ────────────────────────────────────────────
 * Animated Compass SVG – plays once on splash
 * ──────────────────────────────────────────── */
function CompassHero({ size = 120 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer ring with draw-on stroke */}
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

        {/* Cardinal ticks */}
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

        {/* Minor ticks */}
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

      {/* Needle group - oscillation settling like a real compass */}
      <motion.svg
        viewBox="0 0 120 120"
        className="absolute inset-0 w-full h-full"
        initial={{ rotate: -180 }}
        animate={{ rotate: [null, 30, -15, 8, -3, 0] }}
        transition={{ duration: 2, ease: 'easeOut', delay: 0.5 }}
      >
        {/* North needle */}
        <polygon
          points="60,18 56.5,58 63.5,58"
          fill="url(#needleN)"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(99, 102, 241, 0.3))' }}
        />
        {/* South needle */}
        <polygon
          points="60,102 56.5,62 63.5,62"
          fill="url(#needleS)"
        />
        {/* Center pivot */}
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

      {/* Subtle glow pulse */}
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

/* ────────────────────────────────────────────
 * Splash / Greeting Screen
 *
 * Design-system principles applied:
 *  - Sequential revelation (compass → logo → text → dots)
 *  - Blur-to-clear text animation
 *  - No skeleton loaders
 *  - Confident emptiness with generous spacing
 * ──────────────────────────────────────────── */
function SplashScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2800)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
      exit={{ opacity: 0, filter: 'blur(8px)', scale: 0.98 }}
      transition={{ duration: 0.5, ease: ease.smooth }}
    >
      {/* Ambient radial glow */}
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
        {/* 1. Compass animation (first to appear) */}
        <CompassHero size={130} />

        {/* 2. Logo + Platform Name (sequential reveal) */}
        <motion.div
          className="flex items-center gap-4 mt-10"
          initial={{ opacity: 0, filter: 'blur(10px)', y: 16 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{ delay: 1.1, duration: 0.6, ease: ease.smooth }}
        >
          {/* Inline SVG - never fails to load */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.4, ...ease.spring }}
          >
            <Plutus21Logo
              size={36}
              className="text-foreground"
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
            {PLATFORM_NAME}
          </motion.span>
        </motion.div>

        {/* 3. Tagline (blur-to-clear) */}
        <motion.p
          className="mt-3 text-sm text-muted-foreground tracking-wide"
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ delay: 1.9, duration: 0.5, ease: ease.smooth }}
        >
          {COMPANY_NAME} Performance Platform
        </motion.p>

        {/* 4. Subtle loading indicator */}
        <motion.div
          className="flex gap-1.5 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1 h-1 rounded-full bg-muted-foreground/40"
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  )
}

/* ────────────────────────────────────────────
 * Main Login Page
 * ──────────────────────────────────────────── */
export default function LoginPage() {
  const [users, setUsers] = useState<User[]>([])
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)

    const loadUsers = async () => {
      try {
        const res = await fetch('/api/auth/login')
        const data = await res.json()

        if (!res.ok || data.error) {
          const message = data.error || 'Failed to load users'
          setUsers([])
          setUsersLoadError(message)
          toast.error(message)
          return
        }

        setUsers(Array.isArray(data.users) ? data.users : [])
        setUsersLoadError(null)
      } catch {
        setUsers([])
        setUsersLoadError('Failed to load users')
        toast.error('Failed to load users')
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [])

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false)
  }, [])

  const handleSelectUser = (userId: string) => {
    if (loggingIn) return
    const user = users.find((u) => u.id === userId)
    if (!user) {
      toast.error('User not found')
      return
    }
    setSelectedUser(user)
    setPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return
    setLoggingIn(true)
    try {
      const body = selectedUser.hasPassword
        ? { name: selectedUser.name, password }
        : { name: selectedUser.name, newPassword, confirmPassword }
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (data.success) {
        toast.success(
          selectedUser.hasPassword
            ? `Welcome back, ${selectedUser.name.split(' ')[0]}`
            : `Account set up. Welcome, ${selectedUser.name.split(' ')[0]}!`
        )
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

  const handleBack = () => {
    setSelectedUser(null)
    setPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const isSetup = selectedUser && !selectedUser.hasPassword
  const canSubmitSignIn = selectedUser?.hasPassword && password.length > 0
  const canSubmitSetup =
    selectedUser &&
    !selectedUser.hasPassword &&
    newPassword.length >= 6 &&
    newPassword === confirmPassword

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.department?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!mounted) return null

  const splashVisible = showSplash || loading

  return (
    <>
      {/* Splash overlay */}
      <AnimatePresence>
        {splashVisible && (
          <SplashScreen onComplete={handleSplashComplete} />
        )}
      </AnimatePresence>

      {/* Main login UI — blur-to-clear entrance per design system */}
      <motion.div
        className="min-h-screen relative overflow-hidden bg-background"
        initial={{ opacity: 0, filter: 'blur(12px)' }}
        animate={{
          opacity: splashVisible ? 0 : 1,
          filter: splashVisible ? 'blur(12px)' : 'blur(0px)',
        }}
        transition={{ duration: 0.6, ease: ease.smooth }}
      >
        {/* Aceternity Background Beams */}
        <BackgroundBeams className="opacity-40 dark:opacity-20" />

        {/* Gradient overlays */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-indigo-500/10 via-transparent to-transparent dark:from-indigo-500/5" />
          <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-radial from-purple-500/10 via-transparent to-transparent dark:from-purple-500/5" />
        </div>

        {/* Theme toggle */}
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
            {/* Top: Logo lockup */}
            <motion.div
              initial={{ opacity: 0, filter: 'blur(8px)', y: 12 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: ease.smooth }}
              className="flex items-center gap-4"
            >
              <Plutus21Logo size={36} className="text-foreground" />
              <div className="h-7 w-px bg-border/60" />
              <span className="text-xl font-display tracking-tight text-foreground">
                {PLATFORM_NAME}
              </span>
            </motion.div>

            {/* Center: Hero copy */}
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
                initial={{ opacity: 0, filter: 'blur(8px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                transition={{ delay: 0.55, duration: 0.5, ease: ease.smooth }}
                className="text-lg text-muted-foreground leading-relaxed"
              >
                Performance reviews, leave management, and team collaboration —
                everything you need to thrive at {COMPANY_NAME}.
              </motion.p>
            </div>

            {/* Bottom: Signature */}
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
              {/* Mobile branding */}
              <div className="lg:hidden text-center mb-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Plutus21Logo size={32} className="text-foreground" />
                  <span className="text-xl font-display tracking-tight">
                    {PLATFORM_NAME}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {COMPANY_NAME} Performance Platform
                </p>
              </div>

              <Card className="rounded-card border-border/50 shadow-premium">
                <CardContent className="p-8">
                  <AnimatePresence mode="wait">
                    {selectedUser ? (
                      /* ── Sign-in / password setup ── */
                      <motion.div
                        key="signin"
                        initial={{ opacity: 0, filter: 'blur(6px)', x: 20 }}
                        animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
                        exit={{ opacity: 0, filter: 'blur(6px)', x: -20 }}
                        transition={{ duration: 0.3, ease: ease.smooth }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleBack}
                          className="mb-6 gap-2 -ml-2 text-muted-foreground hover:text-foreground"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Back
                        </Button>

                        <div className="flex items-center gap-4 mb-6">
                          <UserAvatar name={selectedUser.name} size="lg" />
                          <div>
                            <h2 className="text-xl font-medium text-foreground">
                              {selectedUser.name}
                            </h2>
                            {selectedUser.department && (
                              <p className="text-sm text-muted-foreground">
                                {selectedUser.department}
                              </p>
                            )}
                          </div>
                        </div>

                        <form onSubmit={handleSignIn}>
                          {isSetup ? (
                            <>
                              <p className="text-sm text-muted-foreground mb-4">
                                Set up your password to sign in.
                              </p>
                              <div className="mb-4 space-y-2">
                                <Label htmlFor="new-password" className="flex items-center gap-1 text-muted-foreground">
                                  <Lock className="w-3.5 h-3.5" />
                                  New password
                                </Label>
                                <div className="relative">
                                  <Input
                                    id="new-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="At least 6 characters"
                                    autoFocus
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
                              <div className="mb-6 space-y-2">
                                <Label htmlFor="confirm-password" className="text-muted-foreground">
                                  Confirm password
                                </Label>
                                <Input
                                  id="confirm-password"
                                  type={showPassword ? 'text' : 'password'}
                                  value={confirmPassword}
                                  onChange={(e) => setConfirmPassword(e.target.value)}
                                  placeholder="Re-enter password"
                                />
                                {confirmPassword && newPassword !== confirmPassword && (
                                  <p className="text-xs text-destructive">
                                    Passwords do not match
                                  </p>
                                )}
                              </div>
                            </>
                          ) : (
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
                                  autoFocus
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
                          )}

                          <ShimmerButton
                            type="submit"
                            disabled={loggingIn || (isSetup ? !canSubmitSetup : !canSubmitSignIn)}
                            className="w-full disabled:opacity-50"
                          >
                            {loggingIn ? (
                              <>
                                <div className="w-4 h-4 spinner" />
                                {isSetup ? 'Setting up...' : 'Signing in...'}
                              </>
                            ) : isSetup ? (
                              'Set password & sign in'
                            ) : (
                              'Sign In'
                            )}
                          </ShimmerButton>
                        </form>

                        {!isSetup && (
                          <p className="text-xs text-center text-muted-foreground mt-6">
                            Forgot your password? Contact HR.
                          </p>
                        )}
                      </motion.div>
                    ) : (
                      /* ── User selection ── */
                      <motion.div
                        key="users"
                        initial={{ opacity: 0, filter: 'blur(6px)', x: -20 }}
                        animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
                        exit={{ opacity: 0, filter: 'blur(6px)', x: 20 }}
                        transition={{ duration: 0.3, ease: ease.smooth }}
                      >
                        <div className="mb-8">
                          <h2 className="text-2xl font-display text-foreground mb-2">
                            Welcome back
                          </h2>
                          <p className="text-sm text-muted-foreground">
                            Select your name to continue
                          </p>
                        </div>

                        {/* Search */}
                        <div className="relative mb-6">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            type="text"
                            placeholder="Search by name or department..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>

                        {/* Users list */}
                        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                          {usersLoadError ? (
                            <div className="text-center py-12">
                              <AlertCircle className="w-10 h-10 text-destructive/40 mx-auto mb-3" />
                              <p className="text-sm text-destructive">{usersLoadError}</p>
                              <p className="text-xs text-muted-foreground mt-2">
                                Open <span className="font-mono">/api/auth/login</span> to inspect the backend response.
                              </p>
                            </div>
                          ) : filteredUsers.length === 0 ? (
                            <div className="text-center py-12">
                              <Users className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                              <p className="text-sm text-muted-foreground">
                                No users found
                              </p>
                            </div>
                          ) : (
                            filteredUsers.map((user, index) => (
                              <motion.button
                                key={user.id}
                                onClick={() => handleSelectUser(user.id)}
                                disabled={loggingIn}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.03, duration: 0.3, ease: ease.smooth }}
                                className="w-full px-4 py-3 text-left bg-card hover:bg-muted/60 rounded-xl transition-all duration-200 border border-transparent hover:border-border group disabled:opacity-60"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <UserAvatar name={user.name} size="sm" />
                                    <div>
                                      <div className="text-sm font-medium text-foreground">
                                        {user.name}
                                      </div>
                                      {user.department && (
                                        <div className="text-xs text-muted-foreground">
                                          {user.department}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {user.role === 'HR' && (
                                      <Badge
                                        variant="secondary"
                                        className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-0 text-[10px] uppercase tracking-wider"
                                      >
                                        HR
                                      </Badge>
                                    )}
                                    {user.role === 'SECURITY' && (
                                      <Badge
                                        variant="secondary"
                                        className="bg-muted text-muted-foreground border-0 text-[10px] uppercase tracking-wider"
                                      >
                                        Security
                                      </Badge>
                                    )}
                                    {user.role === 'OA' && (
                                      <Badge
                                        variant="secondary"
                                        className="bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-0 text-[10px] uppercase tracking-wider"
                                      >
                                        O&amp;A
                                      </Badge>
                                    )}
                                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                                  </div>
                                </div>
                              </motion.button>
                            ))
                          )}
                        </div>

                        <div className="mt-6 pt-6 border-t border-border">
                          <p className="text-[11px] text-center text-muted-foreground/60 uppercase tracking-wider">
                            {users.length} team members &bull; {COMPANY_NAME}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>

              {/* Mobile signature */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="lg:hidden flex items-center justify-center gap-2 mt-8 text-xs text-muted-foreground/40"
              >
                <span>Crafted by</span>
                <span className="font-medium text-muted-foreground/60">AHK</span>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </>
  )
}
