'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Building2,
  Briefcase,
  MessageCircle,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Palette,
} from 'lucide-react'
import {
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  AVATAR_COLORS,
  getAvatarColor,
  getSkinTone,
  getHairColor,
  getHairStyle,
  getBodyType,
  type BodyType,
} from '@/lib/office-config'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── Avatar Preview Drawing (matches OfficeSprites.ts character renderer) ────

function parseHex(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  return [parseInt(c.substring(0, 2), 16), parseInt(c.substring(2, 4), 16), parseInt(c.substring(4, 6), 16)]
}
function toHex(r: number, g: number, b: number): string {
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [r, g, b].map(v => cl(v).toString(16).padStart(2, '0')).join('')
}
function lighten(c: string, n: number): string { const [r, g, b] = parseHex(c); return toHex(r + n, g + n, b + n) }
function darken(c: string, n: number): string { const [r, g, b] = parseHex(c); return toHex(r - n, g - n, b - n) }

type PFn = (x: number, y: number, w: number, h: number, color: string) => void

function drawHairPreview(p: PFn, dir: 'down', style: number, color: string) {
  const hi = lighten(color, 15)
  const lo = darken(color, 10)
  switch (style) {
    case 0: p(7,1,6,3,color); p(8,0,4,1,color); p(7,1,6,1,hi); break
    case 1: p(7,2,6,2,color); p(8,0,1,2,color); p(10,-1,1,3,color); p(12,0,1,2,color); p(7,2,6,1,hi); break
    case 2: p(6,1,7,3,color); p(6,0,5,1,color); p(6,1,2,1,hi); break
    case 3: p(6,1,8,3,color); p(7,0,6,1,color); p(7,0,4,1,hi); p(6,4,1,6,color); p(13,4,1,6,color); break
    case 4: p(6,0,8,4,color); p(5,1,1,3,color); p(14,1,1,3,color); p(7,0,6,1,hi); p(7,1,1,1,hi); p(11,2,1,1,hi); p(9,0,1,1,lo); p(13,1,1,1,lo); break
  }
}

function drawAvatarPreview(
  canvas: HTMLCanvasElement,
  shirtColor: string, skinColor: string, hairColor: string, hairStyle: number, bodyType: BodyType,
) {
  const W = 20, H = 28, SCALE = 4
  const SW = W * SCALE, SH = H * SCALE
  canvas.width = SW
  canvas.height = SH
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, SW, SH)

  const p: PFn = (x, y, w, h, color) => {
    ctx.fillStyle = color
    ctx.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE)
  }
  const shoeColor = '#383838', pantsColor = '#484858', beltColor = '#3a3a3a'

  drawHairPreview(p, 'down', hairStyle, hairColor)
  // Head
  p(7,4,6,5,skinColor)
  // Eyebrows
  p(7,5,2,1,darken(hairColor,10)); p(11,5,2,1,darken(hairColor,10))
  // Eyes
  p(8,6,2,2,'#282828'); p(11,6,2,2,'#282828'); p(8,6,1,1,'#ffffff'); p(12,6,1,1,'#ffffff')
  // Neck
  p(9,9,2,1,skinColor)
  // Body
  const bodyW = bodyType === 'female' ? 8 : 10
  const bodyX = bodyType === 'female' ? 6 : 5
  p(bodyX,10,bodyW,7,shirtColor); p(bodyX,15,bodyW,2,darken(shirtColor,18))
  // Collar
  p(8,10,4,1,darken(shirtColor,10)); p(9,10,2,1,lighten(shirtColor,8))
  // Pocket (male)
  if (bodyType === 'male') p(11,12,2,2,darken(shirtColor,8))
  // Arms
  p(bodyX-2,11,2,5,skinColor); p(bodyX+bodyW,11,2,5,skinColor)
  // Belt
  p(bodyX,17,bodyW,1,beltColor)
  // Pants
  const pantsX = bodyType === 'female' ? 6 : 5
  const pantsW = bodyType === 'female' ? 8 : 10
  p(pantsX,18,pantsW,4,pantsColor); p(9,18,2,4,darken(pantsColor,5))
  // Legs / shoes
  p(pantsX+1,22,3,2,pantsColor); p(pantsX+pantsW-4,22,3,2,pantsColor)
  p(pantsX+1,24,3,2,shoeColor); p(pantsX+pantsW-4,24,3,2,shoeColor)
  p(pantsX+1,24,3,1,lighten(shoeColor,15)); p(pantsX+pantsW-4,24,3,1,lighten(shoeColor,15))
}

const HAIR_STYLE_NAMES = ['Short', 'Spiky', 'Side-part', 'Long', 'Curly']

export default function ProfilePage() {
  const user = useLayoutUser()
  const [email, setEmail] = useState('')
  const [discordId, setDiscordId] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  // Avatar state
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [avatarBodyType, setAvatarBodyType] = useState<BodyType>('male')
  const [avatarHairStyle, setAvatarHairStyle] = useState(0)
  const [avatarHairColor, setAvatarHairColor] = useState(HAIR_COLORS[0])
  const [avatarSkinTone, setAvatarSkinTone] = useState(SKIN_TONES[0])
  const [avatarShirtColor, setAvatarShirtColor] = useState(AVATAR_COLORS[0])
  const [savingAvatar, setSavingAvatar] = useState(false)

  useEffect(() => {
    setEmail(user?.email || '')
    setDiscordId(user?.discordId || '')
    if (user) {
      setAvatarBodyType((user.avatarBodyType as BodyType) || getBodyType(user.id))
      setAvatarHairStyle(user.avatarHairStyle ?? getHairStyle(user.id))
      setAvatarHairColor(user.avatarHairColor || getHairColor(user.id))
      setAvatarSkinTone(user.avatarSkinTone || getSkinTone(user.id))
      setAvatarShirtColor(user.avatarShirtColor || getAvatarColor(user.id))
    }
  }, [user])

  // Redraw avatar preview when any avatar setting changes
  const redrawAvatar = useCallback(() => {
    if (canvasRef.current) {
      drawAvatarPreview(canvasRef.current, avatarShirtColor, avatarSkinTone, avatarHairColor, avatarHairStyle, avatarBodyType)
    }
  }, [avatarShirtColor, avatarSkinTone, avatarHairColor, avatarHairStyle, avatarBodyType])

  useEffect(() => { redrawAvatar() }, [redrawAvatar])

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()

    const normalizedEmail = email.trim()
    const normalizedDiscordId = discordId.trim()

    if (normalizedEmail && !EMAIL_REGEX.test(normalizedEmail)) {
      toast.error('Please enter a valid email address')
      return
    }

    setSavingProfile(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail || null,
          discordId: normalizedDiscordId || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setEmail(data.user?.email || '')
        setDiscordId(data.user?.discordId || '')
        toast.success('Profile details updated')
      } else {
        toast.error(data.error || 'Failed to update profile details')
      }
    } catch {
      toast.error('Failed to update profile details')
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user?.id) {
      toast.error('Unable to resolve your account')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setSavingPassword(true)
    try {
      const res = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          password: newPassword,
          currentPassword: currentPassword || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Password updated successfully')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        toast.error(data.error || 'Failed to update password')
      }
    } catch {
      toast.error('Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleAvatarSave = async () => {
    setSavingAvatar(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim() || null,
          discordId: discordId.trim() || null,
          avatarBodyType,
          avatarHairStyle,
          avatarHairColor,
          avatarSkinTone,
          avatarShirtColor,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Avatar updated')
      } else {
        toast.error(data.error || 'Failed to save avatar')
      }
    } catch {
      toast.error('Failed to save avatar')
    } finally {
      setSavingAvatar(false)
    }
  }

  return (
    <div className="p-6 sm:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          Profile
        </h1>
        <p className="text-muted-foreground mt-1">Your account information and settings</p>
      </motion.div>

      {/* Profile Card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <UserAvatar name={user?.name || ''} size="lg" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">{user?.name}</h2>
                <Badge variant="secondary" className="mt-1 capitalize">
                  {user?.role?.toLowerCase()}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Department</p>
                  <p className="text-sm font-medium text-foreground">{user?.department || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Position</p>
                  <p className="text-sm font-medium text-foreground">{user?.position || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium text-foreground break-all">{email || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Discord ID</p>
                  <p className="text-sm font-medium text-foreground font-mono">{discordId || 'Not set'}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleProfileUpdate} className="space-y-4 mt-6 pt-5 border-t border-border">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Update Contact Details</h3>
              </div>
              <div>
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="profile-discordId">Discord ID</Label>
                <Input
                  id="profile-discordId"
                  type="text"
                  value={discordId}
                  onChange={(e) => setDiscordId(e.target.value)}
                  placeholder="e.g. 123456789012345678"
                  className="mt-1"
                />
              </div>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save Contact Details'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Password Change Card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">Change Password</h3>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <Label htmlFor="currentPassword">Current Password (if set)</Label>
                <div className="relative mt-1">
                  <Input
                    id="currentPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Leave blank if no password set"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showPassword ? 'Hide' : 'Show'} passwords
                </button>
              </div>

              <Button type="submit" disabled={savingPassword || !newPassword}>
                {savingPassword ? 'Saving...' : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Avatar Customization Card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="mt-6">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <Palette className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">Virtual Office Avatar</h3>
            </div>

            <div className="flex flex-col sm:flex-row gap-6">
              {/* Live Preview */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="rounded-lg bg-muted/60 border border-border p-4 flex items-center justify-center" style={{ width: 120, height: 152 }}>
                  <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated' }} />
                </div>
                <span className="text-xs text-muted-foreground">Preview</span>
              </div>

              {/* Controls */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Body Type */}
                <div>
                  <Label>Body Type</Label>
                  <Select value={avatarBodyType} onValueChange={(v) => setAvatarBodyType(v as BodyType)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Hair Style */}
                <div>
                  <Label>Hair Style</Label>
                  <Select value={String(avatarHairStyle)} onValueChange={(v) => setAvatarHairStyle(Number(v))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HAIR_STYLE_NAMES.map((name, i) => (
                        <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Hair Color */}
                <div>
                  <Label>Hair Color</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {HAIR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAvatarHairColor(c)}
                        className="w-7 h-7 rounded-md border-2 transition-all"
                        style={{
                          backgroundColor: c,
                          borderColor: avatarHairColor === c ? 'var(--primary)' : 'transparent',
                          outline: avatarHairColor === c ? '2px solid var(--primary)' : 'none',
                          outlineOffset: 1,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Skin Tone */}
                <div>
                  <Label>Skin Tone</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {SKIN_TONES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAvatarSkinTone(c)}
                        className="w-7 h-7 rounded-md border-2 transition-all"
                        style={{
                          backgroundColor: c,
                          borderColor: avatarSkinTone === c ? 'var(--primary)' : 'transparent',
                          outline: avatarSkinTone === c ? '2px solid var(--primary)' : 'none',
                          outlineOffset: 1,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Shirt Color */}
                <div className="sm:col-span-2">
                  <Label>Shirt Color</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {AVATAR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAvatarShirtColor(c)}
                        className="w-7 h-7 rounded-md border-2 transition-all"
                        style={{
                          backgroundColor: c,
                          borderColor: avatarShirtColor === c ? 'var(--primary)' : 'transparent',
                          outline: avatarShirtColor === c ? '2px solid var(--primary)' : 'none',
                          outlineOffset: 1,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-border">
              <Button onClick={handleAvatarSave} disabled={savingAvatar}>
                {savingAvatar ? 'Saving...' : 'Save Avatar'}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Changes will appear in the virtual office on your next visit.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
