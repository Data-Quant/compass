import * as Phaser from 'phaser'
import { Client, Room } from 'colyseus.js'
import {
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, T, SPRITE_ASSETS,
  getSkinTone, getHairColor,
  STATUS_COLORS, generateDefaultMap, CHAT_BUBBLE_DURATION,
  type OfficeStatus, type ChatChannel,
} from '@/lib/office-config'
import { OFFICE_MOVE_RATE_LIMIT_MS, OFFICE_WORLD, getOfficeZoneAt } from '@/shared/office-world'
import {
  resolveAvatarV2Settings,
  type AvatarHairCategory,
} from '@/shared/avatar-v2'

// Map v2 hair category to the numeric style index that drawHair() in
// OfficeSprites consumes. drawHair has 5 patterns (0-4). 'covered' is unused
// (the hijab is rendered via a separate path).
function hairCategoryToStyleIndex(category: AvatarHairCategory): number {
  switch (category) {
    case 'short':   return 0
    case 'tied':    return 1
    case 'medium':  return 2
    case 'long':    return 3
    case 'curly':   return 4
    case 'covered': return 0
  }
}
import {
  generateFloorTextures, generateObjectTextures, generateCharacterTexture,
  generateAmbientTexture, generateVignetteTexture, generateMonitorGlowTexture,
  generateShadowTexture,
  getFloorTextureKey, getObjectTextureKey, isSpriteAsset,
} from '../sprites/OfficeSprites'

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
  avatarSchemaVersion?: number | null
  avatarBodyFrame?: string | null
  avatarOutfitType?: string | null
  avatarOutfitColor?: string | null
  avatarOutfitAccentColor?: string | null
  avatarHairCategory?: string | null
  avatarHeadCoveringType?: string | null
  avatarHeadCoveringColor?: string | null
  avatarAccessories?: string[] | null
  cubicleId?: string | null
  leadershipOfficeId?: string | null
  seniorOfficeEligible?: boolean
  statusText?: string
  currentZoneId?: string | null
  currentZoneLabel?: string | null
  currentAudioMode?: string
  seatedAt?: string | null
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

interface PlayerSprite {
  container: Phaser.GameObjects.Container
  sprite: Phaser.GameObjects.Sprite
  shadow: Phaser.GameObjects.Image
  nameLabel: Phaser.GameObjects.Text
  nameBg: Phaser.GameObjects.Rectangle
  statusDot: Phaser.GameObjects.Arc
  chatBubble?: Phaser.GameObjects.Container
  chatTimer?: Phaser.Time.TimerEvent
  speakingIndicator?: Phaser.GameObjects.Arc
  targetX: number
  targetY: number
  textureKey: string
  walkFrame: number
  walkTimer: number
  isMoving: boolean
  direction: string
  idleTimer: number
}

export interface OfficeSceneCallbacks {
  onPlayersChange: (players: PlayerData[]) => void
  onChatMessage: (msg: ChatMessageData) => void
  onConnectionError: (error: string) => void
  onConnected: () => void
  onDisconnected: () => void
  onReconnecting?: (attempt: number, nextDelayMs: number) => void
  onPlayerPositionChange?: (userId: string, x: number, y: number) => void
  onLocalSessionReady?: (localUserId: string) => void
}

// ─── Scene ──────────────────────────────────────────────────────────────────

export class OfficeScene extends Phaser.Scene {
  private room: Room | null = null
  private client: Client | null = null
  private mapData: number[][] = []
  private floorData: number[][] = []
  private playerSprites = new Map<string, PlayerSprite>()
  private playersData = new Map<string, PlayerData>()
  private localSessionId = ''
  private callbacks: OfficeSceneCallbacks
  private token: string
  private serverUrl: string
  // Reconnect state
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalDisconnect = false
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key }
  private lastMoveTime = 0
  private moveInterval = OFFICE_MOVE_RATE_LIMIT_MS
  private isConnected = false
  private animatedPlants: { sprite: Phaser.GameObjects.Image; baseX: number; time: number }[] = []
  private monitorSprites: Phaser.GameObjects.Image[] = []
  private ambientOverlay: Phaser.GameObjects.Image | null = null
  private vignetteOverlay: Phaser.GameObjects.Image | null = null
  private monitorGlowImages: Phaser.GameObjects.Image[] = []
  private gameTime = 0
  private baseZoom = 1
  private userZoom = 1

  constructor(token: string, serverUrl: string, callbacks: OfficeSceneCallbacks) {
    super({ key: 'OfficeScene' })
    this.token = token
    this.serverUrl = serverUrl
    this.callbacks = callbacks
  }

  preload() {
    for (const [key, asset] of Object.entries(SPRITE_ASSETS)) {
      this.load.image(key, asset.path)
    }
  }

  create() {
    generateFloorTextures(this)
    generateObjectTextures(this)
    generateShadowTexture(this)

    const { tileMap, floorMap } = generateDefaultMap()
    this.mapData = tileMap
    this.floorData = floorMap

    this.drawMap()
    this.updateCameraZoom()
    this.setupInput()
    this.addAmbientLighting()
    this.connectToServer()

    this.scale.on('resize', () => this.updateCameraZoom())
  }

  // ─── Dynamic Camera Zoom ──────────────────────────────────────────

  private updateCameraZoom() {
    // Target: show ~26 tiles across the viewport width
    const targetWidthInTiles = 26
    this.baseZoom = this.cameras.main.width / (targetWidthInTiles * TILE_SIZE)
    this.applyCameraZoom()
  }

  private applyCameraZoom() {
    const zoom = this.baseZoom * this.userZoom
    this.cameras.main.setZoom(Math.max(0.5, Math.min(zoom, 5)))
  }

  // ─── Map Drawing ────────────────────────────────────────────────────

  private drawMap() {
    this.cameras.main.setBackgroundColor('#1a1520')

    // ── Pass 1: Floors (depth 0) ──────────────────────────────────
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const floorType = this.floorData[y][x]
        // Skip walls — they render their own opaque background
        if (floorType === T.WALL) continue
        const px = x * TILE_SIZE
        const py = y * TILE_SIZE
        const floorKey = getFloorTextureKey(floorType)
        this.add.image(px, py, floorKey).setOrigin(0, 0).setDepth(0)
      }
    }

    // ── Pass 2: Objects (depth 1) ─────────────────────────────────
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = this.mapData[y][x]
        const objKey = getObjectTextureKey(tile)
        if (!objKey) continue

        const px = x * TILE_SIZE
        const py = y * TILE_SIZE

        if (isSpriteAsset(tile)) {
          // PNG sprite — load from preloaded image with scale
          const asset = SPRITE_ASSETS[objKey]
          const img = this.add.image(px, py, objKey)
            .setOrigin(0, 0)
            .setScale(asset.scale)
            .setDepth(1)

          if (tile === T.PLANT) {
            this.animatedPlants.push({
              sprite: img,
              baseX: px,
              time: Math.random() * Math.PI * 2,
            })
          }
          if (tile === T.DESK_H) {
            this.monitorSprites.push(img)
          }
        } else {
          // Procedural texture (wall, sofa, whiteboard, glass)
          const img = this.add.image(px, py, objKey).setOrigin(0, 0).setDepth(1)
          // Walls render at depth 1 too (opaque, no floor underneath)
          if (tile === T.WALL) {
            img.setDepth(1)
          }
        }
      }
    }

    // ── Pass 3: Wall shadows (depth 2) ────────────────────────────
    for (let sy = 1; sy < MAP_HEIGHT; sy++) {
      for (let sx = 0; sx < MAP_WIDTH; sx++) {
        const above = this.mapData[sy - 1][sx]
        const current = this.mapData[sy][sx]
        if (above === T.WALL && current !== T.WALL && current !== T.GLASS_WALL) {
          this.add.image(sx * TILE_SIZE, sy * TILE_SIZE, 'tile_wall_shadow')
            .setOrigin(0, 0)
            .setDepth(2)
        }
      }
    }

    this.addWorldLabels()
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
  }

  private addWorldLabels() {
    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '10px',
      fontFamily: 'system-ui, sans-serif',
      color: '#e5e7eb',
      align: 'center',
      stroke: '#111827',
      strokeThickness: 3,
    }

    for (const zone of OFFICE_WORLD.zones) {
      if (zone.id === 'lobby') continue
      const cx = ((zone.x1 + zone.x2) / 2) * TILE_SIZE
      const cy = (zone.y1 + 0.8) * TILE_SIZE
      this.add.text(cx, cy, zone.label, labelStyle).setOrigin(0.5, 0.5).setDepth(3).setAlpha(0.75)
    }

    const lobby = OFFICE_WORLD.zones.find((zone) => zone.id === 'lobby')
    if (lobby) {
      const cx = ((lobby.x1 + lobby.x2) / 2) * TILE_SIZE
      const cy = (lobby.y1 + 2.2) * TILE_SIZE
      const icon = this.add.text(cx - 132, cy, '2', {
        fontSize: '54px',
        fontFamily: 'system-ui, sans-serif',
        fontStyle: '900',
        color: '#2778f6',
      }).setOrigin(0.5, 0.5).setDepth(4)
      const wordmark = this.add.text(cx - 88, cy + 1, OFFICE_WORLD.branding.companyName, {
        fontSize: '34px',
        fontFamily: 'system-ui, sans-serif',
        fontStyle: '800',
        color: '#273047',
      }).setOrigin(0, 0.5).setDepth(4)
      const plate = this.add.rectangle(cx, cy, 330, 72, 0xf6f8ff, 0.94)
        .setStrokeStyle(2, 0x2778f6, 0.55)
        .setDepth(3)
      icon.setDepth(4)
      wordmark.setDepth(4)
      plate.setDepth(3)
    }
  }

  // ─── Ambient Lighting ───────────────────────────────────────────────

  private addAmbientLighting() {
    const w = MAP_WIDTH * TILE_SIZE
    const h = MAP_HEIGHT * TILE_SIZE

    // Warm ambient gradient (ADD blend — brightens center)
    generateAmbientTexture(this, w, h)
    this.ambientOverlay = this.add.image(0, 0, 'ambient_light')
      .setOrigin(0, 0)
      .setDepth(100)
      .setBlendMode(Phaser.BlendModes.ADD)

    // Vignette (MULTIPLY blend — darkens edges)
    generateVignetteTexture(this, w, h)
    this.vignetteOverlay = this.add.image(0, 0, 'vignette')
      .setOrigin(0, 0)
      .setDepth(99)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)

    // Monitor glow — small blue radial at each DESK_H tile
    generateMonitorGlowTexture(this)
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.mapData[y][x] === T.DESK_H) {
          const glow = this.add.image(
            x * TILE_SIZE + TILE_SIZE / 2,
            y * TILE_SIZE + TILE_SIZE / 2,
            'monitor_glow',
          )
            .setOrigin(0.5, 0.5)
            .setDepth(2)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.25)
            .setScale(2.5)
          this.monitorGlowImages.push(glow)
        }
      }
    }
  }

  // ─── Input Setup ────────────────────────────────────────────────────

  private setupInput() {
    if (!this.input.keyboard) return
    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = {
      W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    // Mouse wheel zoom
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gos: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      const step = dy > 0 ? 0.9 : 1.1
      this.userZoom = Math.max(0.4, Math.min(this.userZoom * step, 3))
      this.applyCameraZoom()
    })
  }

  // ─── Server Connection ──────────────────────────────────────────────

  /**
   * Schedule the next reconnect attempt with exponential backoff.
   * Doubling delay (1s, 2s, 4s, 8s, capped at 16s). The UI is notified via
   * onReconnecting so it can render a "Reconnecting…" overlay instead of
   * the terminal "Connection error" state.
   */
  private scheduleReconnect() {
    if (this.intentionalDisconnect) return
    if (this.reconnectTimer) return
    this.reconnectAttempt += 1
    const baseDelay = 1000
    const maxDelay = 16_000
    const delay = Math.min(baseDelay * 2 ** (this.reconnectAttempt - 1), maxDelay)
    this.callbacks.onReconnecting?.(this.reconnectAttempt, delay)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connectToServer()
    }, delay)
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /**
   * Public hook for the page to tear down cleanly when the user navigates
   * away. Prevents the reconnect loop from firing on a deliberate exit.
   */
  shutdownNetwork() {
    this.intentionalDisconnect = true
    this.clearReconnectTimer()
    this.room?.leave().catch(() => {})
  }

  private async connectToServer() {
    try {
      if (!this.client) {
        this.client = new Client(this.serverUrl)
      }
      this.room = await this.client.joinOrCreate('office', { token: this.token })
      this.isConnected = true
      // Successful connect resets backoff so a future drop starts at 1s again.
      this.reconnectAttempt = 0
      this.clearReconnectTimer()

      this.room.onMessage('fullState', (data: {
        players: PlayerData[]; chatHistory: ChatMessageData[]; yourSessionId: string
      }) => {
        this.localSessionId = data.yourSessionId
        for (const p of data.players) {
          this.playersData.set(p.sessionId, p)
          this.addPlayerSprite(p.sessionId, p)
          this.callbacks.onPlayerPositionChange?.(p.userId, p.x, p.y)
        }
        // Fire local session ready so audio hook knows our identity
        const localPlayer = data.players.find((p) => p.sessionId === data.yourSessionId)
        if (localPlayer) {
          this.callbacks.onLocalSessionReady?.(localPlayer.userId)
        }
        for (const msg of data.chatHistory) this.callbacks.onChatMessage(msg)
        this.notifyPlayersChange()
        this.callbacks.onConnected()
      })

      this.room.onMessage('playerJoined', (player: PlayerData) => {
        this.playersData.set(player.sessionId, player)
        this.addPlayerSprite(player.sessionId, player)
        this.callbacks.onPlayerPositionChange?.(player.userId, player.x, player.y)
        this.notifyPlayersChange()
      })

      this.room.onMessage('playerLeft', (data: { sessionId: string }) => {
        this.playersData.delete(data.sessionId)
        this.removePlayerSprite(data.sessionId)
        this.notifyPlayersChange()
      })

      this.room.onMessage('playerMoved', (data: {
        sessionId: string; x: number; y: number; direction: string; isMoving: boolean
        currentZoneId?: string | null; currentZoneLabel?: string | null; currentAudioMode?: string
      }) => {
        const player = this.playersData.get(data.sessionId)
        if (!player) return
        player.x = data.x; player.y = data.y
        player.direction = data.direction; player.isMoving = data.isMoving
        player.currentZoneId = data.currentZoneId ?? getOfficeZoneAt(data.x, data.y)?.id ?? null
        player.currentZoneLabel = data.currentZoneLabel ?? getOfficeZoneAt(data.x, data.y)?.label ?? null
        player.currentAudioMode = data.currentAudioMode ?? getOfficeZoneAt(data.x, data.y)?.audioMode ?? 'open'

        const sprite = this.playerSprites.get(data.sessionId)
        if (sprite) {
          sprite.targetX = data.x * TILE_SIZE + TILE_SIZE / 2
          sprite.targetY = data.y * TILE_SIZE + TILE_SIZE / 2
          sprite.isMoving = data.isMoving
          sprite.direction = data.direction
        }

        this.callbacks.onPlayerPositionChange?.(player.userId, data.x, data.y)
      })

      this.room.onMessage('playerStopped', (data: { sessionId: string }) => {
        const player = this.playersData.get(data.sessionId)
        if (player) player.isMoving = false
        const sprite = this.playerSprites.get(data.sessionId)
        if (sprite) sprite.isMoving = false
      })

      this.room.onMessage('playerStatus', (data: { sessionId: string; status: string }) => {
        const player = this.playersData.get(data.sessionId)
        if (!player) return
        player.status = data.status
        const sprite = this.playerSprites.get(data.sessionId)
        if (sprite) {
          const c = Phaser.Display.Color.HexStringToColor(
            STATUS_COLORS[data.status as OfficeStatus] || STATUS_COLORS.ONLINE
          ).color
          sprite.statusDot.setFillStyle(c)
        }
        this.notifyPlayersChange()
      })

      this.room.onMessage('playerStatusText', (data: { sessionId: string; statusText: string }) => {
        const player = this.playersData.get(data.sessionId)
        if (!player) return
        player.statusText = data.statusText
        this.notifyPlayersChange()
      })

      this.room.onMessage('playerSeated', (data: { sessionId: string; seatedAt: string | null }) => {
        const player = this.playersData.get(data.sessionId)
        if (!player) return
        player.seatedAt = data.seatedAt
        this.notifyPlayersChange()
      })

      this.room.onMessage('chatMessage', (msg: ChatMessageData) => {
        this.callbacks.onChatMessage(msg)
        this.showChatBubble(msg.senderId, msg.content)
      })

      this.room.onMessage('kicked', (data: { reason: string }) => {
        // Server-initiated kick (multi-tab, etc). Treat as terminal —
        // do NOT reconnect, otherwise we'd just get kicked again.
        this.intentionalDisconnect = true
        this.clearReconnectTimer()
        this.callbacks.onConnectionError(data.reason)
        this.isConnected = false
      })

      this.room.onLeave(() => {
        this.isConnected = false
        this.callbacks.onDisconnected()
        this.scheduleReconnect()
      })

      this.room.onError((_code, message) => {
        this.callbacks.onConnectionError(message || 'Connection error')
      })
    } catch (err: any) {
      // Initial join failed (or a reconnect attempt failed). Either way,
      // try again unless the page has shut us down.
      if (!this.intentionalDisconnect) {
        this.scheduleReconnect()
      } else {
        this.callbacks.onConnectionError(err.message || 'Failed to connect to office server')
      }
    }
  }

  // ─── Player Sprite Management ───────────────────────────────────────

  private addPlayerSprite(sessionId: string, player: PlayerData) {
    if (this.playerSprites.has(sessionId)) return

    const isLocal = sessionId === this.localSessionId
    const seed = player.userId || player.avatarSeed
    // Resolve v2 settings (filling in deterministic defaults for any missing
    // fields). v1 fields are no longer read; only v2 + skin tone drive rendering.
    const avatar = resolveAvatarV2Settings(seed, {
      avatarSkinTone: player.avatarSkinTone,
      avatarBodyFrame: player.avatarBodyFrame as any,
      avatarOutfitType: player.avatarOutfitType as any,
      avatarOutfitColor: player.avatarOutfitColor,
      avatarOutfitAccentColor: player.avatarOutfitAccentColor,
      avatarHairCategory: player.avatarHairCategory as any,
      avatarHeadCoveringType: player.avatarHeadCoveringType as any,
      avatarHeadCoveringColor: player.avatarHeadCoveringColor,
      avatarAccessories: player.avatarAccessories as any,
    })
    const skinColor = player.avatarSkinTone || getSkinTone(seed)
    const hairColor = getHairColor(seed)
    const hairStyle = hairCategoryToStyleIndex(avatar.avatarHairCategory)
    const bodyType: 'male' | 'female' = avatar.avatarBodyFrame === 'feminine' ? 'female' : 'male'
    const texKey = `char_${player.userId}`

    if (!this.textures.exists(texKey)) {
      generateCharacterTexture(this, texKey, avatar.avatarOutfitColor, skinColor, hairColor, hairStyle, bodyType, {
        bodyFrame: avatar.avatarBodyFrame,
        outfitType: avatar.avatarOutfitType,
        outfitColor: avatar.avatarOutfitColor,
        outfitAccentColor: avatar.avatarOutfitAccentColor,
        headCoveringType: avatar.avatarHeadCoveringType,
        headCoveringColor: avatar.avatarHeadCoveringColor,
        accessories: avatar.avatarAccessories,
      })
    }

    const px = player.x * TILE_SIZE + TILE_SIZE / 2
    const py = player.y * TILE_SIZE + TILE_SIZE / 2

    // Shadow
    const shadow = this.add.image(0, 14, 'shadow').setOrigin(0.5, 0.5).setAlpha(0.5)

    // Character sprite (start at frame 0 = down idle)
    const charSprite = this.add.sprite(0, 0, texKey, 0)
      .setOrigin(0.5, 0.7)

    // Name label
    const firstName = (player.name || '').split(' ')[0] || '?'
    const nameLabel = this.add.text(0, -48, firstName, {
      fontSize: '10px',
      fontFamily: 'system-ui, sans-serif',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0.5)

    const nameBg = this.add.rectangle(0, -48, nameLabel.width + 10, 15, 0x1a1520, 0.75)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(0.5, 0x3c3642, 0.5)

    // Status dot
    const statusColor = Phaser.Display.Color.HexStringToColor(
      STATUS_COLORS[player.status as OfficeStatus] || STATUS_COLORS.ONLINE
    ).color
    const statusDot = this.add.circle(nameLabel.width / 2 + 8, -48, 3.5, statusColor)

    // Local player highlight
    if (isLocal) {
      nameBg.setStrokeStyle(1, 0xf9e2af, 0.6)
    }

    const container = this.add.container(px, py, [shadow, charSprite, nameBg, nameLabel, statusDot])
    container.setDepth(isLocal ? 20 : 10 + py / 1000)

    this.playerSprites.set(sessionId, {
      container, sprite: charSprite, shadow, nameLabel, nameBg, statusDot,
      targetX: px, targetY: py, textureKey: texKey,
      walkFrame: 0, walkTimer: 0, isMoving: false, direction: player.direction || 'down',
      idleTimer: 0,
    })

    if (isLocal) {
      this.cameras.main.startFollow(container, true, 0.08, 0.08)
    }
  }

  private removePlayerSprite(sessionId: string) {
    const sprite = this.playerSprites.get(sessionId)
    if (sprite) {
      if (sprite.chatBubble) sprite.chatBubble.destroy()
      if (sprite.chatTimer) sprite.chatTimer.destroy()
      sprite.container.destroy()
      this.playerSprites.delete(sessionId)
    }
  }

  // ─── Character Animation ────────────────────────────────────────────

  private updateCharacterFrame(ps: PlayerSprite, delta: number) {
    const dirIndex = { down: 0, left: 1, right: 2, up: 3 }[ps.direction] ?? 0

    if (ps.isMoving) {
      ps.walkTimer += delta
      if (ps.walkTimer > 180) {
        ps.walkFrame = ps.walkFrame === 1 ? 2 : 1
        ps.walkTimer = 0
      }
    } else {
      ps.walkFrame = 0
      ps.walkTimer = 0
    }

    // Set the correct frame: row * 3 + col
    ps.sprite.setFrame(dirIndex * 3 + ps.walkFrame)
  }

  // ─── Chat Bubbles ───────────────────────────────────────────────────

  private showChatBubble(senderId: string, content: string) {
    let targetSessionId: string | null = null
    this.playersData.forEach((p, sid) => {
      if (p.userId === senderId) targetSessionId = sid
    })
    if (!targetSessionId) return
    const ps = this.playerSprites.get(targetSessionId)
    if (!ps) return

    if (ps.chatBubble) ps.chatBubble.destroy()
    if (ps.chatTimer) ps.chatTimer.destroy()

    const truncated = content.length > 50 ? content.slice(0, 47) + '...' : content
    const bubbleText = this.add.text(0, 0, truncated, {
      fontSize: '9px',
      fontFamily: 'system-ui, sans-serif',
      color: '#e0d8d0',
      wordWrap: { width: 110 },
      align: 'center',
    }).setOrigin(0.5, 1)

    const bw = bubbleText.width + 14
    const bh = bubbleText.height + 10
    const bubbleBg = this.add.rectangle(0, -bubbleText.height / 2, bw, bh, 0x2a2430, 0.92)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(1, 0x4a4450, 0.7)

    // Tail triangle
    const tail = this.add.triangle(0, bh / 2 - bubbleText.height / 2 + 2, -4, 0, 4, 0, 0, 5, 0x2a2430, 0.92)

    const bubbleContainer = this.add.container(0, -66, [bubbleBg, bubbleText, tail])
    ps.container.add(bubbleContainer)
    ps.chatBubble = bubbleContainer

    ps.chatTimer = this.time.delayedCall(CHAT_BUBBLE_DURATION, () => {
      if (ps.chatBubble) {
        ps.chatBubble.destroy()
        ps.chatBubble = undefined
      }
    })
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private notifyPlayersChange() {
    this.callbacks.onPlayersChange(Array.from(this.playersData.values()))
  }

  setSpeakingUsers(userIds: Set<string>) {
    this.playerSprites.forEach((ps, sessionId) => {
      const player = this.playersData.get(sessionId)
      const isSpeaking = player ? userIds.has(player.userId) : false

      if (isSpeaking && !ps.speakingIndicator) {
        const ring = this.add.circle(0, 6, 14, 0x22c55e, 0)
          .setStrokeStyle(2, 0x22c55e, 0.8)
        ps.container.addAt(ring, 0) // behind everything
        ps.speakingIndicator = ring
      } else if (!isSpeaking && ps.speakingIndicator) {
        ps.speakingIndicator.destroy()
        ps.speakingIndicator = undefined
      }
    })
  }

  sendChat(content: string, channel: ChatChannel) {
    if (!this.room || !this.isConnected) return
    this.room.send('chat', { content, channel })
  }

  setStatus(status: OfficeStatus) {
    if (!this.room || !this.isConnected) return
    this.room.send('status', { status })
  }

  // ─── Game Loop ──────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    this.gameTime += delta

    // ── Animate plants (subtle sway) ─────────────────────────────
    for (const plant of this.animatedPlants) {
      plant.time += delta * 0.002
      plant.sprite.x = plant.baseX + Math.sin(plant.time) * 0.6
    }

    // ── Animate monitor screens (subtle flicker) ─────────────────
    if (Math.floor(this.gameTime / 2000) % 2 === 0) {
      for (const m of this.monitorSprites) {
        m.setAlpha(0.95 + Math.sin(this.gameTime * 0.005) * 0.05)
      }
    }

    // ── Update character animations ──────────────────────────────
    this.playerSprites.forEach((ps) => {
      this.updateCharacterFrame(ps, delta)

      // Idle breathing (subtle Y oscillation)
      if (!ps.isMoving) {
        ps.idleTimer += delta
        ps.sprite.y = Math.sin(ps.idleTimer * 0.003) * 0.5
      } else {
        ps.idleTimer = 0
        ps.sprite.y = 0
      }

      // Interpolate position
      const dx = ps.targetX - ps.container.x
      const dy = ps.targetY - ps.container.y
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        ps.container.x += dx * 0.2
        ps.container.y += dy * 0.2
      } else {
        ps.container.x = ps.targetX
        ps.container.y = ps.targetY
      }

      // Pulse speaking indicator
      if (ps.speakingIndicator) {
        const scale = 0.8 + Math.sin(this.gameTime * 0.006) * 0.2
        ps.speakingIndicator.setScale(scale)
      }

      // Update depth for y-sorting
      ps.container.setDepth(10 + ps.container.y / 1000)
    })

    // ── Input ────────────────────────────────────────────────────
    const activeEl = document.activeElement
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return
    if (!this.room || !this.isConnected) return

    const now = Date.now()
    if (now - this.lastMoveTime >= this.moveInterval) {
      let mdx = 0, mdy = 0

      if (this.cursors?.left?.isDown || this.wasd?.A?.isDown) mdx = -1
      else if (this.cursors?.right?.isDown || this.wasd?.D?.isDown) mdx = 1
      else if (this.cursors?.up?.isDown || this.wasd?.W?.isDown) mdy = -1
      else if (this.cursors?.down?.isDown || this.wasd?.S?.isDown) mdy = 1

      if (mdx !== 0 || mdy !== 0) {
        this.room.send('move', { dx: mdx, dy: mdy })
        this.lastMoveTime = now
      } else {
        const localPlayer = this.playersData.get(this.localSessionId)
        if (localPlayer?.isMoving) this.room.send('stopMoving')
      }
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────

  cleanup() {
    if (this.room) {
      this.room.leave()
      this.room = null
    }
    this.isConnected = false
  }
}
