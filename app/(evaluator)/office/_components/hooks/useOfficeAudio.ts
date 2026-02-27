'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  Track,
  ConnectionState,
} from 'livekit-client'
import { getAudioZone, MAX_AUDIO_RADIUS, type AudioZone } from '@/lib/office-config'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Position {
  x: number
  y: number
}

interface UseOfficeAudioOptions {
  enabled: boolean
}

interface UseOfficeAudioReturn {
  isConnected: boolean
  isMuted: boolean
  isPushToTalk: boolean
  masterVolume: number
  speakingUserIds: Set<string>
  currentZone: AudioZone | null
  toggleMic: () => void
  setMasterVolume: (v: number) => void
  setPushToTalk: (enabled: boolean) => void
  startPushToTalk: () => void
  stopPushToTalk: () => void
  updatePosition: (userId: string, x: number, y: number) => void
  setLocalUserId: (userId: string) => void
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useOfficeAudio({ enabled }: UseOfficeAudioOptions): UseOfficeAudioReturn {
  const roomRef = useRef<Room | null>(null)
  const positionsRef = useRef<Map<string, Position>>(new Map())
  const localUserIdRef = useRef<string>('')
  const masterVolumeRef = useRef(1)
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const isMutedRef = useRef(true)
  const isPushToTalkRef = useRef(false)

  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [isPushToTalk, setIsPushToTalkState] = useState(false)
  const [masterVolume, setMasterVolumeState] = useState(1)
  const [speakingUserIds, setSpeakingUserIds] = useState<Set<string>>(new Set())
  const [currentZone, setCurrentZone] = useState<AudioZone | null>(null)

  // ── Volume calculation ────────────────────────────────────────────────

  const recalculateVolumes = useCallback(() => {
    const room = roomRef.current
    if (!room) return

    const localId = localUserIdRef.current
    if (!localId) return

    const localPos = positionsRef.current.get(localId)
    if (!localPos) return

    const localZone = getAudioZone(localPos.x, localPos.y)

    // Update currentZone state only when it actually changes
    setCurrentZone((prev) => {
      if (prev?.id === localZone?.id) return prev
      return localZone
    })

    const master = masterVolumeRef.current

    room.remoteParticipants.forEach((participant) => {
      const remoteId = participant.identity
      const remotePos = positionsRef.current.get(remoteId)

      let volume = 0

      if (remotePos) {
        const remoteZone = getAudioZone(remotePos.x, remotePos.y)

        if (localZone && remoteZone && localZone.id === remoteZone.id) {
          // Both in same private room — full volume
          volume = 1
        } else if (localZone || remoteZone) {
          // One inside a private room, one outside — isolated
          volume = 0
        } else {
          // Both in open space — distance-based attenuation
          const dist = Math.abs(localPos.x - remotePos.x) + Math.abs(localPos.y - remotePos.y)
          volume = Math.max(0, 1 - dist / MAX_AUDIO_RADIUS)
        }
      }

      volume *= master

      // Apply volume to all audio elements for this participant
      participant.audioTrackPublications.forEach((pub) => {
        if (pub.track && pub.track.kind === Track.Kind.Audio) {
          const els = pub.track.attachedElements
          for (const el of els) {
            if (el instanceof HTMLAudioElement) {
              el.volume = volume
            }
          }
        }
      })

      // Also update our tracked elements
      const el = audioElementsRef.current.get(remoteId)
      if (el) {
        el.volume = volume
      }
    })
  }, [])

  // ── Attach audio for a remote track ───────────────────────────────────

  const attachTrack = useCallback(
    (participant: RemoteParticipant, publication: RemoteTrackPublication) => {
      if (!publication.track || publication.track.kind !== Track.Kind.Audio) return

      const el = publication.track.attach()
      if (el instanceof HTMLAudioElement) {
        el.volume = 0 // will be set by recalculateVolumes
        audioElementsRef.current.set(participant.identity, el)
      }
      recalculateVolumes()
    },
    [recalculateVolumes]
  )

  const detachTrack = useCallback(
    (participant: RemoteParticipant, publication: RemoteTrackPublication) => {
      if (publication.track) {
        publication.track.detach()
      }
      audioElementsRef.current.delete(participant.identity)
    },
    []
  )

  // ── Connect / disconnect ──────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    })
    roomRef.current = room

    // Event listeners
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio && participant instanceof RemoteParticipant) {
        attachTrack(participant, publication as RemoteTrackPublication)
      }
    })

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (participant instanceof RemoteParticipant) {
        detachTrack(participant, publication as RemoteTrackPublication)
      }
    })

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const ids = new Set(speakers.map((s) => s.identity))
      setSpeakingUserIds(ids)
    })

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      setIsConnected(state === ConnectionState.Connected)
    })

    // Connect
    async function connect() {
      try {
        const res = await fetch('/api/office/livekit-token', { method: 'POST' })
        if (!res.ok) return
        const { token } = await res.json()
        if (cancelled) return

        const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL
        if (!livekitUrl) {
          console.warn('NEXT_PUBLIC_LIVEKIT_URL not set, audio disabled')
          return
        }

        await room.connect(livekitUrl, token)
        if (cancelled) {
          room.disconnect()
          return
        }

        setIsConnected(true)

        // Attach existing remote audio tracks
        room.remoteParticipants.forEach((participant) => {
          participant.audioTrackPublications.forEach((pub) => {
            if (pub.isSubscribed && pub.track) {
              attachTrack(participant, pub)
            }
          })
        })
      } catch (err) {
        console.error('LiveKit connection failed:', err)
      }
    }

    connect()

    return () => {
      cancelled = true
      room.disconnect()
      roomRef.current = null
      setIsConnected(false)

      // Clean up audio elements
      audioElementsRef.current.forEach((el) => {
        el.srcObject = null
        el.remove()
      })
      audioElementsRef.current.clear()
    }
  }, [enabled, attachTrack, detachTrack])

  // ── Public methods ────────────────────────────────────────────────────

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return

    const newMuted = !isMutedRef.current
    isMutedRef.current = newMuted
    setIsMuted(newMuted)

    await room.localParticipant.setMicrophoneEnabled(!newMuted)
  }, [])

  const setMasterVolume = useCallback(
    (v: number) => {
      masterVolumeRef.current = v
      setMasterVolumeState(v)
      recalculateVolumes()
    },
    [recalculateVolumes]
  )

  const setPushToTalk = useCallback((on: boolean) => {
    isPushToTalkRef.current = on
    setIsPushToTalkState(on)

    // When enabling PTT, mute mic (will unmute on key press)
    if (on) {
      const room = roomRef.current
      if (room) {
        isMutedRef.current = true
        setIsMuted(true)
        room.localParticipant.setMicrophoneEnabled(false)
      }
    }
  }, [])

  const startPushToTalk = useCallback(async () => {
    if (!isPushToTalkRef.current) return
    const room = roomRef.current
    if (!room) return
    isMutedRef.current = false
    setIsMuted(false)
    await room.localParticipant.setMicrophoneEnabled(true)
  }, [])

  const stopPushToTalk = useCallback(async () => {
    if (!isPushToTalkRef.current) return
    const room = roomRef.current
    if (!room) return
    isMutedRef.current = true
    setIsMuted(true)
    await room.localParticipant.setMicrophoneEnabled(false)
  }, [])

  const updatePosition = useCallback(
    (userId: string, x: number, y: number) => {
      positionsRef.current.set(userId, { x, y })
      recalculateVolumes()
    },
    [recalculateVolumes]
  )

  const setLocalUserId = useCallback((userId: string) => {
    localUserIdRef.current = userId
  }, [])

  return {
    isConnected,
    isMuted,
    isPushToTalk,
    masterVolume,
    speakingUserIds,
    currentZone,
    toggleMic,
    setMasterVolume,
    setPushToTalk,
    startPushToTalk,
    stopPushToTalk,
    updatePosition,
    setLocalUserId,
  }
}
