'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { StatusSelector } from './_components/StatusSelector'
import { ChatPanel } from './_components/ChatPanel'
import { PlayerList } from './_components/PlayerList'
import { ControlsOverlay } from './_components/ControlsOverlay'
import { MicControls } from './_components/MicControls'
import { useOfficeAudio } from './_components/hooks/useOfficeAudio'
import { Loader2, WifiOff, Users, MessageSquare } from 'lucide-react'
import type { OfficeGameHandle } from './_components/OfficeGame'
import type { OfficeStatus, ChatChannel } from '@/lib/office-config'

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

type ConnectionState = 'loading' | 'connecting' | 'connected' | 'error' | 'kicked'

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

  // Proximity audio
  const audio = useOfficeAudio({ enabled: connectionState === 'connected' })

  const handlePlayerPositionChange = useCallback((userId: string, x: number, y: number) => {
    audio.updatePosition(userId, x, y)
  }, [audio.updatePosition])

  const handleLocalSessionReady = useCallback((localUserId: string) => {
    audio.setLocalUserId(localUserId)
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
    if (connectionState !== 'kicked') {
      setConnectionState('error')
      setError('Disconnected from server')
    }
  }, [connectionState])

  const handleSendMessage = useCallback((content: string, channel: ChatChannel) => {
    gameRef.current?.sendChat(content, channel)
  }, [])

  const handleStatusChange = useCallback((newStatus: OfficeStatus) => {
    setStatus(newStatus)
    gameRef.current?.setStatus(newStatus)
  }, [])

  // Loading state
  if (connectionState === 'loading') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Preparing office...</p>
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
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-foreground">Virtual Office</h1>
          <StatusSelector current={status} onChange={handleStatusChange} />
        </div>
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

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Game canvas */}
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
              onPlayerPositionChange={handlePlayerPositionChange}
              onLocalSessionReady={handleLocalSessionReady}
            />
          )}
          <ControlsOverlay />
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
        </div>

        {/* Side panel */}
        {sidePanel && (
          <div className="w-[260px] shrink-0 border-l border-border">
            {sidePanel === 'chat' && (
              <ChatPanel messages={messages} onSendMessage={handleSendMessage} />
            )}
            {sidePanel === 'players' && (
              <PlayerList players={players} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
