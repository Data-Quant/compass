'use client'

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { OfficeStatus, ChatChannel } from '@/lib/office-config'

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

export interface OfficeGameHandle {
  sendChat: (content: string, channel: ChatChannel) => void
  setStatus: (status: OfficeStatus) => void
  setSpeakingUsers: (userIds: Set<string>) => void
}

interface OfficeGameProps {
  token: string
  serverUrl: string
  onPlayersChange: (players: PlayerData[]) => void
  onChatMessage: (msg: ChatMessageData) => void
  onConnectionError: (error: string) => void
  onConnected: () => void
  onDisconnected: () => void
  onPlayerPositionChange?: (userId: string, x: number, y: number) => void
  onLocalSessionReady?: (localUserId: string) => void
}

const OfficeGame = forwardRef<OfficeGameHandle, OfficeGameProps>(function OfficeGame(
  { token, serverUrl, onPlayersChange, onChatMessage, onConnectionError, onConnected, onDisconnected, onPlayerPositionChange, onLocalSessionReady },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const sceneRef = useRef<any>(null)

  // Stable callback refs to avoid re-creating the scene
  const callbacksRef = useRef({ onPlayersChange, onChatMessage, onConnectionError, onConnected, onDisconnected, onPlayerPositionChange, onLocalSessionReady })
  callbacksRef.current = { onPlayersChange, onChatMessage, onConnectionError, onConnected, onDisconnected, onPlayerPositionChange, onLocalSessionReady }

  useImperativeHandle(ref, () => ({
    sendChat: (content: string, channel: ChatChannel) => {
      sceneRef.current?.sendChat(content, channel)
    },
    setStatus: (status: OfficeStatus) => {
      sceneRef.current?.setStatus(status)
    },
    setSpeakingUsers: (userIds: Set<string>) => {
      sceneRef.current?.setSpeakingUsers(userIds)
    },
  }))

  useEffect(() => {
    if (!containerRef.current) return

    let game: Phaser.Game | null = null
    let destroyed = false

    // Dynamic import to avoid SSR window crash
    import('phaser').then((Phaser) => {
      if (destroyed) return

      // Dynamic import of the scene
      import('./scenes/OfficeScene').then(({ OfficeScene }) => {
        if (destroyed || !containerRef.current) return

        const scene = new OfficeScene(token, serverUrl, {
          onPlayersChange: (p) => callbacksRef.current.onPlayersChange(p),
          onChatMessage: (m) => callbacksRef.current.onChatMessage(m),
          onConnectionError: (e) => callbacksRef.current.onConnectionError(e),
          onConnected: () => callbacksRef.current.onConnected(),
          onDisconnected: () => callbacksRef.current.onDisconnected(),
          onPlayerPositionChange: (userId, x, y) => callbacksRef.current.onPlayerPositionChange?.(userId, x, y),
          onLocalSessionReady: (userId) => callbacksRef.current.onLocalSessionReady?.(userId),
        })

        sceneRef.current = scene

        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: containerRef.current!,
          width: containerRef.current!.clientWidth,
          height: containerRef.current!.clientHeight,
          backgroundColor: '#11111b',
          scene: scene,
          physics: { default: 'arcade' },
          scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          render: {
            pixelArt: true,
            antialias: false,
          },
        })

        gameRef.current = game
      })
    })

    return () => {
      destroyed = true
      if (sceneRef.current) {
        sceneRef.current.cleanup()
        sceneRef.current = null
      }
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
    }
  }, [token, serverUrl])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
    />
  )
})

export default OfficeGame
