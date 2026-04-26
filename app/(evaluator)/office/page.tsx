'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { StatusSelector } from './_components/StatusSelector'
import { ChatPanel } from './_components/ChatPanel'
import { PlayerList } from './_components/PlayerList'
import { ControlsOverlay } from './_components/ControlsOverlay'
import { MicControls } from './_components/MicControls'
import { useOfficeAudio } from './_components/hooks/useOfficeAudio'
import { Loader2, WifiOff, Users, MessageSquare, Map, Search, HelpCircle, Smile, Mic, Radio } from 'lucide-react'
import type { OfficeGameHandle } from './_components/OfficeGame'
import {
  getSkinTone,
  type OfficeStatus,
  type ChatChannel,
} from '@/lib/office-config'
import { OFFICE_WORLD, OFFICE_MAP_HEIGHT, OFFICE_MAP_WIDTH } from '@/shared/office-world'

// Dynamic import to prevent SSR issues with Phaser
const OfficeGame = dynamic(() => import('./_components/OfficeGame'), { ssr: false })

interface PlayerData {
  sessionId: string
  userId: string
  name: string
  department: string
  position: string
  role: string
  x: number
  y: number
  direction: string
  isMoving: boolean
  status: string
  avatarSeed: string
  currentZoneId?: string | null
  currentZoneLabel?: string | null
  currentAudioMode?: string
  cubicleId?: string | null
  leadershipOfficeId?: string | null
  statusText?: string
}

interface ChatMessageData {
  id: string
  senderId: string
  senderName: string
  content: string
  channel: string
  x: number
  y: number
  timestamp: number
}

type ConnectionState = 'loading' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'kicked'

export default function OfficePage() {
  const gameRef = useRef<OfficeGameHandle>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading')
  const [error, setError] = useState<string>('')
  const [token, setToken] = useState<string>('')
  const [serverUrl, setServerUrl] = useState<string>('')
  const [players, setPlayers] = useState<PlayerData[]>([])
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [status, setStatus] = useState<OfficeStatus>('ONLINE')
  const [sidePanel, setSidePanel] = useState<'chat' | 'players' | null>('chat')
  const [bootstrap, setBootstrap] = useState<any>(null)
  const [teammateQuery, setTeammateQuery] = useState('')
  const [localUserId, setLocalUserId] = useState('')
  const [showAvatarSetup, setShowAvatarSetup] = useState(false)
  const [savingDefaultAvatar, setSavingDefaultAvatar] = useState(false)

  // Proximity audio
  const audio = useOfficeAudio({ enabled: connectionState === 'connected' })

  const handlePlayerPositionChange = useCallback((userId: string, x: number, y: number) => {
    audio.updatePosition(userId, x, y)
  }, [audio.updatePosition])

  const handleLocalSessionReady = useCallback((localUserId: string) => {
    audio.setLocalUserId(localUserId)
    setLocalUserId(localUserId)
  }, [audio.setLocalUserId])

  // Forward speaking indicators to the game scene
  useEffect(() => {
    gameRef.current?.setSpeakingUsers(audio.speakingUserIds)
  }, [audio.speakingUserIds])

  // Fetch token on mount
  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await fetch('/api/office/token', { method: 'POST' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to get token')
        }
        const data = await res.json()
        setToken(data.token)
        setServerUrl(data.serverUrl)
        setBootstrap(data)
        setShowAvatarSetup(Boolean(data.avatarNeedsSetup))
        setConnectionState('connecting')
      } catch (err: any) {
        setError(err.message || 'Failed to connect')
        setConnectionState('error')
      }
    }
    fetchToken()
  }, [])

  const handlePlayersChange = useCallback((p: PlayerData[]) => {
    setPlayers(p)
  }, [])

  const handleChatMessage = useCallback((msg: ChatMessageData) => {
    setMessages((prev) => {
      const next = [...prev, msg]
      // Keep last 200 messages client-side
      return next.length > 200 ? next.slice(-200) : next
    })
  }, [])

  const handleConnectionError = useCallback((err: string) => {
    setError(err)
    setConnectionState(err.includes('another tab') ? 'kicked' : 'error')
  }, [])

  const handleConnected = useCallback(() => {
    setConnectionState('connected')
  }, [])

  const handleDisconnected = useCallback(() => {
    // The scene will auto-attempt reconnects after this fires; show a
    // transient state instead of the terminal "error" banner. If reconnect
    // never succeeds, onConnectionError will eventually flip us to 'error'.
    if (connectionState !== 'kicked') {
      setConnectionState('reconnecting')
      setError('')
    }
  }, [connectionState])

  const handleReconnecting = useCallback((attempt: number, nextDelayMs: number) => {
    if (connectionState === 'kicked') return
    setConnectionState('reconnecting')
    const seconds = Math.round(nextDelayMs / 1000)
    setError(`Reconnecting (attempt ${attempt}, retrying in ${seconds}s)…`)
  }, [connectionState])

  const handleSendMessage = useCallback((content: string, channel: ChatChannel) => {
    gameRef.current?.sendChat(content, channel)
  }, [])

  const handleStatusChange = useCallback((newStatus: OfficeStatus) => {
    setStatus(newStatus)
    gameRef.current?.setStatus(newStatus)
  }, [])

  const localPlayer = players.find((player) => player.userId === localUserId) || players[0]
  const currentZone = localPlayer?.currentZoneLabel || audio.currentZone?.label || 'Open Office'
  const filteredPlayers = teammateQuery.trim()
    ? players.filter((player) => `${player.name} ${player.department} ${player.position}`.toLowerCase().includes(teammateQuery.toLowerCase()))
    : players

  const handleUseDefaultAvatar = useCallback(async () => {
    if (!bootstrap?.avatar) return
    const seed = bootstrap.user?.id || localUserId || 'office-user'
    const isHijab = bootstrap.avatar.avatarHeadCoveringType === 'hijab'
    setSavingDefaultAvatar(true)
    try {
      const res = await fetch('/api/office/avatar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarBodyFrame: bootstrap.avatar.avatarBodyFrame,
          avatarOutfitType: bootstrap.avatar.avatarOutfitType,
          avatarOutfitColor: bootstrap.avatar.avatarOutfitColor,
          avatarOutfitAccentColor: bootstrap.avatar.avatarOutfitAccentColor,
          avatarHairCategory: isHijab ? 'covered' : bootstrap.avatar.avatarHairCategory,
          avatarSkinTone: getSkinTone(seed),
          avatarHeadCoveringType: bootstrap.avatar.avatarHeadCoveringType,
          avatarHeadCoveringColor: bootstrap.avatar.avatarHeadCoveringColor,
          avatarAccessories: bootstrap.avatar.avatarAccessories || [],
        }),
      })
      if (!res.ok) throw new Error('Failed to save default avatar')
      setBootstrap((prev: any) => ({ ...prev, avatarNeedsSetup: false }))
      setShowAvatarSetup(false)
    } catch {
      setError('Could not save the default avatar. You can still customize it from your profile.')
    } finally {
      setSavingDefaultAvatar(false)
    }
  }, [bootstrap, localUserId])

  // Loading state
  if (connectionState === 'loading') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Preparing Plutus21 HQ...</p>
        </div>
      </div>
    )
  }

  // Reconnecting — auto-retry in progress, show transient state.
  if (connectionState === 'reconnecting') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3 max-w-sm">
          <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
          <p className="text-sm font-medium text-foreground">Reconnecting to office</p>
          <p className="text-xs text-muted-foreground">{error || 'Trying again shortly…'}</p>
        </div>
      </div>
    )
  }

  // Error / kicked state
  if (connectionState === 'error' || connectionState === 'kicked') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3 max-w-sm">
          <WifiOff className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm font-medium text-foreground">
            {connectionState === 'kicked' ? 'Disconnected' : 'Connection Error'}
          </p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            Reconnect
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden bg-[#07090f]" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#0b0f19]/95 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-[#2778f6] text-sm font-black text-white">2</div>
            <div>
              <h1 className="text-sm font-semibold text-white leading-tight">Plutus21 HQ</h1>
              <p className="text-[11px] text-slate-400 leading-tight">{currentZone}</p>
            </div>
          </div>
          <StatusSelector current={status} onChange={handleStatusChange} />
          <div className="hidden lg:flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              value={teammateQuery}
              onChange={(event) => setTeammateQuery(event.target.value)}
              placeholder="Find teammate..."
              className="w-52 bg-transparent text-xs text-white placeholder:text-slate-500 outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <MicControls
            isConnected={audio.isConnected}
            isMuted={audio.isMuted}
            isPushToTalk={audio.isPushToTalk}
            masterVolume={audio.masterVolume}
            currentZone={audio.currentZone}
            onToggleMic={audio.toggleMic}
            onSetMasterVolume={audio.setMasterVolume}
            onSetPushToTalk={audio.setPushToTalk}
            onStartPushToTalk={audio.startPushToTalk}
            onStopPushToTalk={audio.stopPushToTalk}
          />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSidePanel(sidePanel === 'players' ? null : 'players')}
              className={`p-1.5 rounded transition-colors ${sidePanel === 'players' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              title="Player list"
            >
              <Users className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSidePanel(sidePanel === 'chat' ? null : 'chat')}
              className={`p-1.5 rounded transition-colors ${sidePanel === 'chat' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              title="Chat"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 relative min-w-0">
          {connectionState === 'connecting' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center space-y-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                <p className="text-xs text-muted-foreground">Connecting to office...</p>
              </div>
            </div>
          )}
          {token && serverUrl && (
            <OfficeGame
              ref={gameRef}
              token={token}
              serverUrl={serverUrl}
              onPlayersChange={handlePlayersChange}
              onChatMessage={handleChatMessage}
              onConnectionError={handleConnectionError}
              onConnected={handleConnected}
              onDisconnected={handleDisconnected}
              onReconnecting={handleReconnecting}
              onPlayerPositionChange={handlePlayerPositionChange}
              onLocalSessionReady={handleLocalSessionReady}
            />
          )}
          <ControlsOverlay />
          <div className="pointer-events-none absolute left-4 top-4 z-20 w-64 rounded-md border border-white/10 bg-[#0b0f19]/90 p-3 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Current Room</p>
                <p className="text-sm font-semibold text-white">{currentZone}</p>
              </div>
              <div className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300">
                <Radio className="h-3 w-3" />
                {audio.currentZone ? 'Isolated' : 'Proximity'}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-300">
              <div className="rounded border border-white/10 bg-white/[0.04] py-2">
                <div className="text-sm font-semibold text-white">{players.length}</div>
                Online
              </div>
              <div className="rounded border border-white/10 bg-white/[0.04] py-2">
                <div className="text-sm font-semibold text-white">{bootstrap?.assignment?.cubicleId || '-'}</div>
                Cubicle
              </div>
              <div className="rounded border border-white/10 bg-white/[0.04] py-2">
                <div className="text-sm font-semibold text-white">{bootstrap?.assignment?.leadershipOfficeId ? 'Yes' : 'No'}</div>
                Office
              </div>
            </div>
          </div>

          <div className="absolute right-4 top-4 z-20 w-56 rounded-md border border-white/10 bg-[#0b0f19]/90 p-3 shadow-xl backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Map className="h-4 w-4 text-blue-400" />
                Map
              </div>
              <span className="text-[11px] text-slate-500">{OFFICE_WORLD.name}</span>
            </div>
            <div className="relative aspect-[56/36] rounded border border-white/10 bg-slate-950">
              {OFFICE_WORLD.zones.map((zone) => (
                <div
                  key={zone.id}
                  className="absolute rounded-sm border border-white/10 bg-blue-500/10"
                  title={zone.label}
                  style={{
                    left: `${(zone.x1 / OFFICE_MAP_WIDTH) * 100}%`,
                    top: `${(zone.y1 / OFFICE_MAP_HEIGHT) * 100}%`,
                    width: `${((zone.x2 - zone.x1 + 1) / OFFICE_MAP_WIDTH) * 100}%`,
                    height: `${((zone.y2 - zone.y1 + 1) / OFFICE_MAP_HEIGHT) * 100}%`,
                  }}
                />
              ))}
              {players.map((player) => (
                <span
                  key={player.sessionId}
                  className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]"
                  title={player.name}
                  style={{
                    left: `${(player.x / OFFICE_MAP_WIDTH) * 100}%`,
                    top: `${(player.y / OFFICE_MAP_HEIGHT) * 100}%`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-white/10 bg-[#0b0f19]/95 px-3 py-2 shadow-xl backdrop-blur">
            <button className="rounded p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="Microphone">
              <Mic className="h-4 w-4" />
            </button>
            <button onClick={() => setSidePanel(sidePanel === 'chat' ? null : 'chat')} className="rounded p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="Chat">
              <MessageSquare className="h-4 w-4" />
            </button>
            <button onClick={() => setSidePanel(sidePanel === 'players' ? null : 'players')} className="rounded p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="People">
              <Users className="h-4 w-4" />
            </button>
            <button className="rounded p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="React">
              <Smile className="h-4 w-4" />
            </button>
            <button className="rounded p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="Help">
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>

          {showAvatarSetup && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-md border border-white/10 bg-[#0b0f19] p-5 shadow-2xl">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-[#2778f6] text-lg font-black text-white">2</div>
                  <div>
                    <h2 className="text-base font-semibold text-white">Set up your Office V2 avatar</h2>
                    <p className="text-xs text-slate-400">Everyone starts fresh in Plutus21 HQ.</p>
                  </div>
                </div>
                <div className="rounded border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-300">
                  A default professional avatar is ready now. You can enter with it, or jump to the avatar studio to customize outfit, frame, accessories, and hijab options.
                </div>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    onClick={() => { window.location.href = '/profile' }}
                    className="rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-950 hover:bg-slate-200"
                  >
                    Customize Avatar
                  </button>
                  <button
                    onClick={handleUseDefaultAvatar}
                    disabled={savingDefaultAvatar}
                    className="rounded-md border border-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
                  >
                    {savingDefaultAvatar ? 'Saving...' : 'Use Default'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {sidePanel && (
          <div className="w-[260px] shrink-0 border-l border-border">
            {sidePanel === 'chat' && (
              <ChatPanel messages={messages} onSendMessage={handleSendMessage} />
            )}
            {sidePanel === 'players' && (
              <PlayerList players={filteredPlayers} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
