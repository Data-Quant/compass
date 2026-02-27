import * as Phaser from 'phaser'
import { Client, Room } from 'colyseus.js'
import {
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, T,
  getAvatarColor, getSkinTone, STATUS_COLORS,
  generateDefaultMap, CHAT_BUBBLE_DURATION,
  type OfficeStatus, type ChatChannel,
} from '@/lib/office-config'
import {
  generateTileTextures, generateCharacterTexture,
  generateAmbientTexture, generateShadowTexture,
  getTileTextureKey,
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
}

export interface OfficeSceneCallbacks {
  onPlayersChange: (players: PlayerData[]) => void
  onChatMessage: (msg: ChatMessageData) => void
  onConnectionError: (error: string) => void
  onConnected: () => void
  onDisconnected: () => void
  onPlayerPositionChange?: (userId: string, x: number, y: number) => void
  onLocalSessionReady?: (localUserId: string) => void
}

// ─── Scene ──────────────────────────────────────────────────────────────────

export class OfficeScene extends Phaser.Scene {
  private room: Room | null = null
  private client: Client | null = null
  private mapData: number[][] = []
  private playerSprites = new Map<string, PlayerSprite>()
  private playersData = new Map<string, PlayerData>()
  private localSessionId = ''
  private callbacks: OfficeSceneCallbacks
  private token: string
  private serverUrl: string
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key }
  private lastMoveTime = 0
  private moveInterval = 150
  private isConnected = false
  private animatedPlants: { sprite: Phaser.GameObjects.Image; baseX: number; time: number }[] = []
  private monitorSprites: Phaser.GameObjects.Image[] = []
  private ambientOverlay: Phaser.GameObjects.Image | null = null
  private gameTime = 0

  constructor(token: string, serverUrl: string, callbacks: OfficeSceneCallbacks) {
    super({ key: 'OfficeScene' })
    this.token = token
    this.serverUrl = serverUrl
    this.callbacks = callbacks
  }

  create() {
    // Generate all textures
    generateTileTextures(this)
    generateShadowTexture(this)

    this.mapData = generateDefaultMap()
    this.drawMap()
    this.setupInput()
    this.addAmbientLighting()
    this.connectToServer()
  }

  // ─── Map Drawing ────────────────────────────────────────────────────

  private drawMap() {
    this.cameras.main.setBackgroundColor('#1a1520')

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = this.mapData[y][x]
        const px = x * TILE_SIZE
        const py = y * TILE_SIZE
        const key = getTileTextureKey(tile)

        const img = this.add.image(px, py, key).setOrigin(0, 0)

        // Track plants for animation
        if (tile === T.PLANT) {
          this.animatedPlants.push({
            sprite: img,
            baseX: px,
            time: Math.random() * Math.PI * 2,
          })
        }

        // Track monitors for flicker
        if (tile === T.DESK_H) {
          this.monitorSprites.push(img)
        }
      }
    }

    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
  }

  // ─── Ambient Lighting ───────────────────────────────────────────────

  private addAmbientLighting() {
    const w = MAP_WIDTH * TILE_SIZE
    const h = MAP_HEIGHT * TILE_SIZE
    generateAmbientTexture(this, w, h)
    this.ambientOverlay = this.add.image(0, 0, 'ambient_light')
      .setOrigin(0, 0)
      .setDepth(100)
      .setBlendMode(Phaser.BlendModes.ADD)
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
  }

  // ─── Server Connection ──────────────────────────────────────────────

  private async connectToServer() {
    try {
      this.client = new Client(this.serverUrl)
      this.room = await this.client.joinOrCreate('office', { token: this.token })
      this.isConnected = true

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
      }) => {
        const player = this.playersData.get(data.sessionId)
        if (!player) return
        player.x = data.x; player.y = data.y
        player.direction = data.direction; player.isMoving = data.isMoving

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

      this.room.onMessage('chatMessage', (msg: ChatMessageData) => {
        this.callbacks.onChatMessage(msg)
        this.showChatBubble(msg.senderId, msg.content)
      })

      this.room.onMessage('kicked', (data: { reason: string }) => {
        this.callbacks.onConnectionError(data.reason)
        this.isConnected = false
      })

      this.room.onLeave((code) => {
        this.isConnected = false
        this.callbacks.onDisconnected()
      })

      this.room.onError((_code, message) => {
        this.callbacks.onConnectionError(message || 'Connection error')
      })
    } catch (err: any) {
      this.callbacks.onConnectionError(err.message || 'Failed to connect to office server')
    }
  }

  // ─── Player Sprite Management ───────────────────────────────────────

  private addPlayerSprite(sessionId: string, player: PlayerData) {
    if (this.playerSprites.has(sessionId)) return

    const isLocal = sessionId === this.localSessionId
    const shirtColor = getAvatarColor(player.userId || player.avatarSeed)
    const skinColor = getSkinTone(player.userId || player.avatarSeed)
    const texKey = `char_${player.userId}`

    if (!this.textures.exists(texKey)) {
      generateCharacterTexture(this, texKey, shirtColor, skinColor)
    }

    const px = player.x * TILE_SIZE + TILE_SIZE / 2
    const py = player.y * TILE_SIZE + TILE_SIZE / 2

    // Shadow
    const shadow = this.add.image(0, 10, 'shadow').setOrigin(0.5, 0.5).setAlpha(0.5)

    // Character sprite (start at frame 0 = down idle)
    const charSprite = this.add.sprite(0, 0, texKey, 0)
      .setOrigin(0.5, 0.7)

    // Name label
    const firstName = (player.name || '').split(' ')[0] || '?'
    const nameLabel = this.add.text(0, -28, firstName, {
      fontSize: '10px',
      fontFamily: 'system-ui, sans-serif',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0.5)

    const nameBg = this.add.rectangle(0, -28, nameLabel.width + 10, 15, 0x1a1520, 0.75)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(0.5, 0x3c3642, 0.5)

    // Status dot
    const statusColor = Phaser.Display.Color.HexStringToColor(
      STATUS_COLORS[player.status as OfficeStatus] || STATUS_COLORS.ONLINE
    ).color
    const statusDot = this.add.circle(nameLabel.width / 2 + 8, -28, 3.5, statusColor)

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

    const bubbleContainer = this.add.container(0, -45, [bubbleBg, bubbleText, tail])
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
