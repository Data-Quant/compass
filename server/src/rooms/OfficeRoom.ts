import { Room, Client } from 'colyseus'
import { verifyOfficeToken, OfficeTokenPayload } from '../auth'
import {
  OFFICE_MAP_HEIGHT as MAP_HEIGHT,
  OFFICE_MAP_WIDTH as MAP_WIDTH,
  OFFICE_MOVE_RATE_LIMIT_MS,
  OFFICE_SPAWN,
  generateOfficeMap,
  getOfficeZoneAt,
  isOnStage,
  isOfficeTileWalkable,
} from '../../../shared/office-world'

const SPAWN_X = OFFICE_SPAWN.x
const SPAWN_Y = OFFICE_SPAWN.y
const PROXIMITY_RADIUS = 5
const MOVE_RATE_LIMIT = OFFICE_MOVE_RATE_LIMIT_MS
const MAX_CHAT_HISTORY = 50
const VALID_STATUSES = ['ONLINE', 'AWAY', 'BUSY', 'DND']

// ─── Types ──────────────────────────────────────────────────────────────────

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
  avatarSkinTone: string | null
  avatarSchemaVersion: number | null
  avatarBodyFrame: string | null
  avatarOutfitType: string | null
  avatarOutfitColor: string | null
  avatarOutfitAccentColor: string | null
  avatarHairCategory: string | null
  avatarHairColor: string | null
  avatarHeadCoveringType: string | null
  avatarHeadCoveringColor: string | null
  avatarAccessories: string[]
  cubicleId: string | null
  leadershipOfficeId: string | null
  seniorOfficeEligible: boolean
  statusText: string
  currentZoneId: string | null
  currentZoneLabel: string | null
  currentAudioMode: string
  seatedAt: string | null
  lastMoveAt: number
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

// ─── Room ───────────────────────────────────────────────────────────────────

export class OfficeRoom extends Room {
  private mapData: number[][] = []
  private players = new Map<string, PlayerData>()
  private userSessionMap = new Map<string, string>() // userId -> sessionId
  private chatHistory: ChatMessageData[] = []

  onCreate() {
    // No setState — all sync via messages (avoids @colyseus/schema client issues)
    this.mapData = generateOfficeMap().tileMap
    this.maxClients = 30

    // ─── Move handler ──────────────────────────────────────────────
    this.onMessage('move', (client, data: { dx: number; dy: number }) => {
      const player = this.players.get(client.sessionId)
      if (!player) return

      const { dx, dy } = data
      if (Math.abs(dx) + Math.abs(dy) !== 1) return
      if (dx !== 0 && dy !== 0) return
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return

      const now = Date.now()
      if (now - player.lastMoveAt < MOVE_RATE_LIMIT) return

      const newX = player.x + dx
      const newY = player.y + dy

      if (newX < 0 || newX >= MAP_WIDTH || newY < 0 || newY >= MAP_HEIGHT) return
      if (!isOfficeTileWalkable(this.mapData[newY][newX])) return

      // Player collision
      let blocked = false
      this.players.forEach((other) => {
        if (other.sessionId !== client.sessionId && other.x === newX && other.y === newY) {
          blocked = true
        }
      })
      if (blocked) return

      if (dx === 1) player.direction = 'right'
      else if (dx === -1) player.direction = 'left'
      else if (dy === 1) player.direction = 'down'
      else if (dy === -1) player.direction = 'up'

      player.x = newX
      player.y = newY
      player.isMoving = true
      player.lastMoveAt = now
      const zone = getOfficeZoneAt(newX, newY)
      player.currentZoneId = zone?.id ?? null
      player.currentZoneLabel = zone?.label ?? null
      // Standing on a stage tile in the town hall opts the speaker into
      // broadcast mode (heard by everyone in the zone, no proximity falloff).
      // Off-stage = the zone's normal audio mode.
      player.currentAudioMode = isOnStage(newX, newY) ? 'broadcast' : (zone?.audioMode ?? 'open')

      this.broadcast('playerMoved', {
        sessionId: player.sessionId,
        x: player.x,
        y: player.y,
        direction: player.direction,
        isMoving: true,
        currentZoneId: player.currentZoneId,
        currentZoneLabel: player.currentZoneLabel,
        currentAudioMode: player.currentAudioMode,
      })
    })

    // ─── Stop moving ───────────────────────────────────────────────
    this.onMessage('stopMoving', (client) => {
      const player = this.players.get(client.sessionId)
      if (!player || !player.isMoving) return
      player.isMoving = false
      this.broadcast('playerStopped', { sessionId: player.sessionId })
    })

    // ─── Chat handler ──────────────────────────────────────────────
    this.onMessage('chat', (client, data: { content: string; channel: string }) => {
      const player = this.players.get(client.sessionId)
      if (!player) return

      const content = (data.content || '').trim().slice(0, 500)
      if (!content) return

      const channel = data.channel === 'proximity' || data.channel === 'room' ? data.channel : 'global'

      const msg: ChatMessageData = {
        id: `${client.sessionId}-${Date.now()}`,
        senderId: player.userId,
        senderName: player.name,
        content,
        channel,
        x: player.x,
        y: player.y,
        timestamp: Date.now(),
      }

      if (channel === 'global') {
        this.chatHistory.push(msg)
        if (this.chatHistory.length > MAX_CHAT_HISTORY) {
          this.chatHistory.shift()
        }
        this.broadcast('chatMessage', msg)
      } else if (channel === 'room') {
        this.players.forEach((other, sessionId) => {
          if (other.currentZoneId === player.currentZoneId) {
            const target = this.clients.find(c => c.sessionId === sessionId)
            target?.send('chatMessage', msg)
          }
        })
      } else {
        // Proximity: send only to nearby clients
        this.players.forEach((other, sessionId) => {
          const dist = Math.abs(other.x - player.x) + Math.abs(other.y - player.y)
          if (dist <= PROXIMITY_RADIUS) {
            const target = this.clients.find(c => c.sessionId === sessionId)
            target?.send('chatMessage', msg)
          }
        })
      }
    })

    // ─── Status handler ────────────────────────────────────────────
    this.onMessage('status', (client, data: { status: string }) => {
      const player = this.players.get(client.sessionId)
      if (!player) return
      if (!VALID_STATUSES.includes(data.status)) return
      player.status = data.status
      this.broadcast('playerStatus', {
        sessionId: player.sessionId,
        status: player.status,
      })
    })

    this.onMessage('setStatusText', (client, data: { statusText?: string }) => {
      const player = this.players.get(client.sessionId)
      if (!player) return
      player.statusText = (data.statusText || '').trim().slice(0, 80)
      this.broadcast('playerStatusText', {
        sessionId: player.sessionId,
        statusText: player.statusText,
      })
    })

    this.onMessage('typing', (client, data: { channel?: string; isTyping?: boolean }) => {
      const player = this.players.get(client.sessionId)
      if (!player) return
      this.broadcast('typing', {
        sessionId: player.sessionId,
        userId: player.userId,
        name: player.name,
        channel: data.channel === 'room' ? 'room' : data.channel === 'proximity' ? 'proximity' : 'global',
        isTyping: Boolean(data.isTyping),
        currentZoneId: player.currentZoneId,
      }, { except: client })
    })

    this.onMessage('directMessage', (client, data: { targetUserId?: string; content?: string }) => {
      const player = this.players.get(client.sessionId)
      if (!player || !data.targetUserId) return
      const content = (data.content || '').trim().slice(0, 500)
      if (!content) return
      const msg: ChatMessageData = {
        id: `${client.sessionId}-dm-${Date.now()}`,
        senderId: player.userId,
        senderName: player.name,
        content,
        channel: 'direct',
        x: player.x,
        y: player.y,
        timestamp: Date.now(),
      }
      this.players.forEach((other, sessionId) => {
        if (other.userId === data.targetUserId || other.userId === player.userId) {
          const target = this.clients.find(c => c.sessionId === sessionId)
          target?.send('chatMessage', msg)
        }
      })
    })

    this.onMessage('sit', (client, data: { seatId?: string }) => {
      const player = this.players.get(client.sessionId)
      if (!player) return
      player.seatedAt = (data.seatId || player.currentZoneId || 'seat').slice(0, 80)
      this.broadcast('playerSeated', { sessionId: player.sessionId, seatedAt: player.seatedAt })
    })

    this.onMessage('stand', (client) => {
      const player = this.players.get(client.sessionId)
      if (!player) return
      player.seatedAt = null
      this.broadcast('playerSeated', { sessionId: player.sessionId, seatedAt: null })
    })

    this.onMessage('interact', (client, data: { interactableId?: string }) => {
      const player = this.players.get(client.sessionId)
      if (!player || !data.interactableId) return
      client.send('interaction', {
        interactableId: data.interactableId,
        currentZoneId: player.currentZoneId,
      })
    })

    this.onMessage('knock', (client, data: { officeId?: string }) => {
      const player = this.players.get(client.sessionId)
      if (!player || !data.officeId) return
      this.players.forEach((other, sessionId) => {
        if (other.leadershipOfficeId === data.officeId) {
          const target = this.clients.find(c => c.sessionId === sessionId)
          target?.send('knockRequest', {
            officeId: data.officeId,
            fromSessionId: player.sessionId,
            fromUserId: player.userId,
            fromName: player.name,
          })
        }
      })
    })

    this.onMessage('respondToKnock', (client, data: { targetSessionId?: string; officeId?: string; accepted?: boolean }) => {
      const player = this.players.get(client.sessionId)
      if (!player || player.leadershipOfficeId !== data.officeId || !data.targetSessionId) return
      const target = this.clients.find(c => c.sessionId === data.targetSessionId)
      target?.send('knockResponse', {
        officeId: data.officeId,
        accepted: Boolean(data.accepted),
        fromUserId: player.userId,
        fromName: player.name,
      })
    })

    this.onMessage('lockRoom', (client, data: { officeId?: string }) => {
      const player = this.players.get(client.sessionId)
      if (!player || player.leadershipOfficeId !== data.officeId) return
      this.broadcast('roomLockChanged', { officeId: data.officeId, locked: true, ownerUserId: player.userId })
    })

    this.onMessage('unlockRoom', (client, data: { officeId?: string }) => {
      const player = this.players.get(client.sessionId)
      if (!player || player.leadershipOfficeId !== data.officeId) return
      this.broadcast('roomLockChanged', { officeId: data.officeId, locked: false, ownerUserId: player.userId })
    })

    this.onMessage('followPlayer', (client, data: { targetUserId?: string }) => {
      const target = Array.from(this.players.values()).find((p) => p.userId === data.targetUserId)
      if (target) client.send('locatePlayer', { userId: target.userId, x: target.x, y: target.y, currentZoneId: target.currentZoneId })
    })

    this.onMessage('locatePlayer', (client, data: { targetUserId?: string }) => {
      const target = Array.from(this.players.values()).find((p) => p.userId === data.targetUserId)
      if (target) client.send('locatePlayer', { userId: target.userId, x: target.x, y: target.y, currentZoneId: target.currentZoneId })
    })

    this.onMessage('reaction', (client, data: { reaction?: string }) => {
      const player = this.players.get(client.sessionId)
      if (!player) return
      this.broadcast('reaction', {
        sessionId: player.sessionId,
        userId: player.userId,
        reaction: (data.reaction || '').slice(0, 24),
        x: player.x,
        y: player.y,
      })
    })
  }

  async onAuth(_client: Client, options: { token?: string }) {
    if (!options.token) throw new Error('No token provided')
    try {
      return verifyOfficeToken(options.token)
    } catch {
      throw new Error('Invalid or expired token')
    }
  }

  onJoin(client: Client, _options?: unknown, auth?: OfficeTokenPayload) {
    if (!auth) throw new Error('Auth required')

    // Kick duplicate userId (multi-tab prevention)
    const existingSessionId = this.userSessionMap.get(auth.userId)
    if (existingSessionId) {
      const existingClient = this.clients.find(c => c.sessionId === existingSessionId)
      if (existingClient) {
        existingClient.send('kicked', { reason: 'Connected from another tab' })
        existingClient.leave(4000)
      }
      this.players.delete(existingSessionId)
    }

    this.userSessionMap.set(auth.userId, client.sessionId)

    const zone = getOfficeZoneAt(SPAWN_X, SPAWN_Y)
    const player: PlayerData = {
      sessionId: client.sessionId,
      userId: auth.userId,
      name: auth.name,
      department: auth.department || '',
      position: auth.position || '',
      role: auth.role,
      x: SPAWN_X,
      y: SPAWN_Y,
      direction: 'down',
      isMoving: false,
      status: 'ONLINE',
      avatarSeed: auth.userId,
      avatarSkinTone: auth.avatarSkinTone ?? null,
      avatarSchemaVersion: auth.avatarSchemaVersion ?? 2,
      avatarBodyFrame: auth.avatarBodyFrame ?? null,
      avatarOutfitType: auth.avatarOutfitType ?? null,
      avatarOutfitColor: auth.avatarOutfitColor ?? null,
      avatarOutfitAccentColor: auth.avatarOutfitAccentColor ?? null,
      avatarHairCategory: auth.avatarHairCategory ?? null,
      avatarHairColor: auth.avatarHairColor ?? null,
      avatarHeadCoveringType: auth.avatarHeadCoveringType ?? null,
      avatarHeadCoveringColor: auth.avatarHeadCoveringColor ?? null,
      avatarAccessories: auth.avatarAccessories ?? [],
      cubicleId: auth.cubicleId ?? null,
      leadershipOfficeId: auth.leadershipOfficeId ?? null,
      seniorOfficeEligible: Boolean(auth.seniorOfficeEligible),
      statusText: '',
      currentZoneId: zone?.id ?? null,
      currentZoneLabel: zone?.label ?? null,
      currentAudioMode: isOnStage(SPAWN_X, SPAWN_Y) ? 'broadcast' : (zone?.audioMode ?? 'open'),
      seatedAt: null,
      lastMoveAt: 0,
    }

    this.players.set(client.sessionId, player)

    // Send full state to the joining client
    const allPlayers = Array.from(this.players.values()).map(p => ({
      sessionId: p.sessionId,
      userId: p.userId,
      name: p.name,
      department: p.department,
      position: p.position,
      role: p.role,
      x: p.x,
      y: p.y,
      direction: p.direction,
      isMoving: p.isMoving,
      status: p.status,
      avatarSeed: p.avatarSeed,
      avatarSkinTone: p.avatarSkinTone,
      avatarSchemaVersion: p.avatarSchemaVersion,
      avatarBodyFrame: p.avatarBodyFrame,
      avatarOutfitType: p.avatarOutfitType,
      avatarOutfitColor: p.avatarOutfitColor,
      avatarOutfitAccentColor: p.avatarOutfitAccentColor,
      avatarHairCategory: p.avatarHairCategory,
      avatarHairColor: p.avatarHairColor,
      avatarHeadCoveringType: p.avatarHeadCoveringType,
      avatarHeadCoveringColor: p.avatarHeadCoveringColor,
      avatarAccessories: p.avatarAccessories,
      cubicleId: p.cubicleId,
      leadershipOfficeId: p.leadershipOfficeId,
      seniorOfficeEligible: p.seniorOfficeEligible,
      statusText: p.statusText,
      currentZoneId: p.currentZoneId,
      currentZoneLabel: p.currentZoneLabel,
      currentAudioMode: p.currentAudioMode,
      seatedAt: p.seatedAt,
    }))

    client.send('fullState', {
      players: allPlayers,
      chatHistory: this.chatHistory,
      yourSessionId: client.sessionId,
    })

    // Broadcast the new player to everyone else
    const { lastMoveAt, ...publicPlayer } = player
    this.broadcast('playerJoined', publicPlayer, { except: client })

    console.log(`[Office] ${auth.name} joined (${client.sessionId})`)
  }

  onLeave(client: Client) {
    const player = this.players.get(client.sessionId)
    if (player) {
      this.userSessionMap.delete(player.userId)
      console.log(`[Office] ${player.name} left (${client.sessionId})`)
    }
    this.players.delete(client.sessionId)
    this.broadcast('playerLeft', { sessionId: client.sessionId })
  }

  onDispose() {
    console.log('[Office] Room disposed')
  }
}
