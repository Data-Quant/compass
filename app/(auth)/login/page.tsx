'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Search, Users, ChevronRight, Compass, Calendar, BarChart3, ArrowLeft, Lock, Eye, EyeOff } from 'lucide-react'
import { PLATFORM_NAME, COMPANY_NAME, LOGO } from '@/lib/config'

interface User {
  id: string
  name: string
  department?: string
  position?: string
  role: string
  hasPassword?: boolean
}

export default function LoginPage() {
  const [users, setUsers] = useState<User[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  // Debounce search input to prevent rapid filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 150)
    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    setMounted(true)
    fetch('/api/auth/login')
      .then((res) => res.json())
      .then((data) => {
        if (data.users) {
          setUsers(data.users)
        }
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
        toast.error('Failed to load users')
      })
  }, [])

  const handleSelectUser = (userId: string) => {
    // Prevent rapid clicks from selecting wrong user
    if (loggingIn) return
    
    // Find user by ID to avoid closure issues
    const user = users.find(u => u.id === userId)
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
        toast.success(selectedUser.hasPassword ? `Welcome back, ${selectedUser.name.split(' ')[0]}` : `Account set up. Welcome, ${selectedUser.name.split(' ')[0]}!`)
        router.push('/dashboard')
      } else if (response.status === 429) {
        toast.error('Too many login attempts. Please try again later.')
      } else {
        toast.error(data.error || 'Login failed')
      }
    } catch (error) {
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
  const canSubmitSetup = selectedUser && !selectedUser.hasPassword && newPassword.length >= 6 && newPassword === confirmPassword

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
    user.department?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
  )

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
          <p className="text-muted text-sm">Loading {PLATFORM_NAME}...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[var(--background)]">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-indigo-500/10 via-transparent to-transparent dark:from-indigo-500/5" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-radial from-purple-500/10 via-transparent to-transparent dark:from-purple-500/5" />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-conic from-indigo-500/20 via-purple-500/20 to-indigo-500/20 rounded-full blur-3xl"
        />
      </div>

      {/* Theme toggle */}
      <div className="absolute top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 min-h-screen flex">
        {/* Left side - Branding */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        >
          <div>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-4"
            >
              <img src={LOGO.company} alt={COMPANY_NAME} className="h-10 w-auto" />
              <div className="h-8 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xl font-semibold text-foreground">{PLATFORM_NAME}</span>
              </div>
            </motion.div>
          </div>

          <div className="max-w-md">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-5xl font-bold leading-tight mb-6"
            >
              <span className="gradient-text">Your team's</span>{' '}
              <span className="text-foreground">central hub</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-lg text-muted leading-relaxed"
            >
              Performance reviews, leave management, and team collaboration - 
              everything you need to thrive at {COMPANY_NAME}.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex gap-6 mt-12"
            >
              {[
                { icon: BarChart3, label: 'Performance', desc: 'Reviews' },
                { icon: Calendar, label: 'Leave', desc: 'Management' },
                { icon: Users, label: 'Team', desc: 'Collaboration' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{item.label}</div>
                    <div className="text-sm text-muted">{item.desc}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Signature - subtle placement */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex items-center gap-2 text-xs text-muted/50"
          >
            <span>Crafted by</span>
            <span className="font-medium">AHK</span>
          </motion.div>
        </motion.div>

        {/* Right side - Login */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-md"
          >
            {/* Mobile branding */}
            <div className="lg:hidden text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <img src={LOGO.company} alt={COMPANY_NAME} className="h-10 w-auto" />
                <div className="flex items-center gap-2">
                  <Compass className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xl font-semibold">{PLATFORM_NAME}</span>
                </div>
              </div>
              <p className="text-muted text-sm">{COMPANY_NAME} Internal HR Hub</p>
            </div>

            <div className="glass rounded-2xl p-8 shadow-premium-lg">
              <AnimatePresence mode="wait">
                {selectedUser ? (
                  /* Sign in / Set up password */
                  <motion.div
                    key="signin"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <button
                      onClick={handleBack}
                      className="flex items-center gap-2 text-muted hover:text-foreground mb-6 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span className="text-sm">Back</span>
                    </button>

                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-medium text-lg">
                        {selectedUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-foreground">{selectedUser.name}</h2>
                        {selectedUser.department && (
                          <p className="text-muted">{selectedUser.department}</p>
                        )}
                      </div>
                    </div>

                    <form onSubmit={handleSignIn}>
                      {isSetup ? (
                        /* First time: set up password */
                        <>
                          <p className="text-sm text-muted mb-4">Set up your password to sign in.</p>
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-foreground mb-2">
                              <Lock className="w-4 h-4 inline mr-1" />
                              New password
                            </label>
                            <div className="relative">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="At least 6 characters"
                                autoFocus
                                className="w-full px-4 py-3.5 bg-surface border border-border rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all pr-12"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                              >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                              </button>
                            </div>
                          </div>
                          <div className="mb-6">
                            <label className="block text-sm font-medium text-foreground mb-2">Confirm password</label>
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="Re-enter password"
                              className="w-full px-4 py-3.5 bg-surface border border-border rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                            />
                            {confirmPassword && newPassword !== confirmPassword && (
                              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                            )}
                          </div>
                        </>
                      ) : (
                        /* Returning: enter password */
                        <div className="mb-6">
                          <label className="block text-sm font-medium text-foreground mb-2">
                            <Lock className="w-4 h-4 inline mr-1" />
                            Password
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Enter your password"
                              autoFocus
                              className="w-full px-4 py-3.5 bg-surface border border-border rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all pr-12"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                            >
                              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loggingIn || (isSetup ? !canSubmitSetup : !canSubmitSignIn)}
                        className="w-full py-3.5 rounded-xl gradient-primary text-white font-medium hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        {loggingIn ? (
                          <>
                            <div className="w-5 h-5 spinner" />
                            {isSetup ? 'Setting up...' : 'Signing in...'}
                          </>
                        ) : isSetup ? (
                          'Set password & sign in'
                        ) : (
                          'Sign In'
                        )}
                      </button>
                    </form>

                    {!isSetup && (
                      <p className="text-xs text-center text-muted mt-6">
                        Forgot your password? Contact HR.
                      </p>
                    )}
                  </motion.div>
                ) : (
                  /* User Selection Screen */
                  <motion.div
                    key="users"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <div className="mb-8">
                      <h2 className="text-2xl font-semibold text-foreground mb-2">Welcome back</h2>
                      <p className="text-muted">Select your name to continue</p>
                    </div>

                    {/* Search */}
                    <div className="relative mb-6">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted" />
                      <input
                        type="text"
                        placeholder="Search by name or department..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 bg-surface border border-border rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                      />
                    </div>

                    {/* Users list */}
                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                        {filteredUsers.length === 0 ? (
                          <div className="text-center py-12">
                            <Users className="w-12 h-12 text-muted/30 mx-auto mb-3" />
                            <p className="text-muted">No users found</p>
                          </div>
                        ) : (
                          filteredUsers.map((user) => (
                            <button
                              key={user.id}
                              onClick={() => handleSelectUser(user.id)}
                              disabled={loggingIn}
                              className={`w-full px-4 py-3.5 text-left bg-surface hover:bg-surface-hover rounded-xl transition-all duration-200 border border-border hover:border-indigo-500/30 group ${
                                loggingIn ? 'opacity-60' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-medium text-sm">
                                    {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                  </div>
                                  <div>
                                    <div className="font-medium text-foreground">{user.name}</div>
                                    {user.department && (
                                      <div className="text-sm text-muted">{user.department}</div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {user.role === 'HR' && (
                                    <span className="px-2 py-1 text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-md font-medium">
                                      HR
                                    </span>
                                  )}
                                  <ChevronRight className="w-5 h-5 text-muted group-hover:text-indigo-500 transition-colors" />
                                </div>
                                </div>
                            </button>
                          ))
                        )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-border">
                      <p className="text-xs text-center text-muted">
                        {users.length} team members • {COMPANY_NAME}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile signature */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="lg:hidden flex items-center justify-center gap-2 mt-8 text-xs text-muted/50"
            >
              <span>Crafted by</span>
              <span className="font-medium">AHK</span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
