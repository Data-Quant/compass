import { Room, Client } from 'colyseus'
import { verifyOfficeToken, OfficeTokenPayload } from '../auth'

// Map constants (must match lib/office-config.ts)
const MAP_WIDTH = 40
const MAP_HEIGHT = 30
const SPAWN_X = 20
const SPAWN_Y = 25
const PROXIMITY_RADIUS = 5
const MOVE_RATE_LIMIT = 100 // ms
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

// ─── Tile Types (must match lib/office-config.ts T enum) ────────────────────

const T = {
  FLOOR: 0, WALL: 1, DESK_H: 2, DESK_V: 3, MEETING: 4, LOUNGE: 5,
  PLANT: 6, CHAIR: 7, SOFA: 8, BOOKSHELF: 9, COFFEE: 10, WHITEBOARD: 11,
  RUG: 12, WALL_BOTTOM: 13, CARPET: 14, GLASS_WALL: 15,
} as const

// ─── Map ────────────────────────────────────────────────────────────────────

function generateMap(): number[][] {
  const F = T.FLOOR, W = T.WALL, DH = T.DESK_H, DV = T.DESK_V
  const M = T.MEETING, L = T.LOUNGE, P = T.PLANT, CH = T.CHAIR
  const S = T.SOFA, BS = T.BOOKSHELF, CF = T.COFFEE, WB = T.WHITEBOARD
  const R = T.RUG, CP = T.CARPET, GW = T.GLASS_WALL

  const map: number[][] = []
  for (let y = 0; y < MAP_HEIGHT; y++) {
    map[y] = new Array(MAP_WIDTH).fill(F)
  }

  // Border walls
  for (let x = 0; x < MAP_WIDTH; x++) {
    map[0][x] = W; map[1][x] = W
    map[MAP_HEIGHT - 1][x] = W; map[MAP_HEIGHT - 2][x] = W
  }
  for (let y = 0; y < MAP_HEIGHT; y++) {
    map[y][0] = W; map[y][MAP_WIDTH - 1] = W
  }

  // Left Meeting Room (cols 2-8, rows 2-7)
  for (let x = 1; x <= 9; x++) { map[2][x] = W; map[7][x] = W }
  for (let y = 2; y <= 7; y++) { map[y][1] = W; map[y][9] = W }
  for (let y = 3; y <= 5; y++) map[y][9] = GW
  map[6][9] = F
  for (let y = 3; y <= 6; y++) for (let x = 2; x <= 8; x++) map[y][x] = M
  for (let x = 3; x <= 7; x++) map[4][x] = DH
  for (let x = 3; x <= 7; x++) map[5][x] = DH
  map[3][4] = CH; map[3][6] = CH; map[6][4] = CH; map[6][6] = CH
  map[3][2] = WB

  // Right Meeting Room (cols 31-37, rows 2-7)
  for (let x = 30; x <= 38; x++) { map[2][x] = W; map[7][x] = W }
  for (let y = 2; y <= 7; y++) { map[y][30] = W; map[y][38] = W }
  for (let y = 3; y <= 5; y++) map[y][30] = GW
  map[6][30] = F
  for (let y = 3; y <= 6; y++) for (let x = 31; x <= 37; x++) map[y][x] = M
  for (let x = 32; x <= 36; x++) map[4][x] = DH
  for (let x = 32; x <= 36; x++) map[5][x] = DH
  map[3][33] = CH; map[3][35] = CH; map[6][33] = CH; map[6][35] = CH
  map[3][37] = WB

  // Plants along top corridor
  map[2][11] = P; map[2][14] = P; map[2][25] = P; map[2][28] = P

  // Main Workspace — Left desk cluster (cols 3-7, rows 10-15)
  for (const row of [10, 13]) {
    for (let x = 3; x <= 6; x++) map[row][x] = DH
    map[row + 1][3] = CH; map[row + 1][5] = CH
    map[row - 1][4] = CH; map[row - 1][6] = CH
  }

  // Main Workspace — Center cluster (cols 16-23, rows 10-15)
  for (const row of [10, 13]) {
    for (let x = 16; x <= 23; x++) map[row][x] = DH
    map[row + 1][17] = CH; map[row + 1][19] = CH; map[row + 1][21] = CH
    map[row - 1][18] = CH; map[row - 1][20] = CH; map[row - 1][22] = CH
  }

  // Main Workspace — Right cluster (cols 33-36, rows 10-15)
  for (const row of [10, 13]) {
    for (let x = 33; x <= 36; x++) map[row][x] = DH
    map[row + 1][33] = CH; map[row + 1][35] = CH
    map[row - 1][34] = CH; map[row - 1][36] = CH
  }

  // Bookshelf wall (right side, rows 10-15)
  for (let y = 10; y <= 15; y++) map[y][38] = BS

  // Plants in workspace
  map[10][10] = P; map[15][10] = P; map[10][28] = P; map[15][28] = P
  map[12][14] = P; map[12][25] = P

  // Lounge Area (bottom-left, cols 2-12, rows 19-25)
  for (let y = 19; y <= 25; y++) for (let x = 2; x <= 12; x++) map[y][x] = L
  map[20][3] = S; map[20][4] = S; map[20][5] = S
  map[21][3] = S
  map[22][3] = S; map[22][4] = S; map[22][5] = S
  for (let y = 20; y <= 22; y++) for (let x = 6; x <= 8; x++) {
    if (map[y][x] === L) map[y][x] = R
  }
  map[21][7] = DV
  map[19][2] = P; map[19][12] = P; map[25][2] = P

  // Break Room (bottom-right, cols 28-37, rows 19-25)
  for (let y = 18; y <= 25; y++) for (let x = 27; x <= 37; x++) map[y][x] = CP
  for (let y = 18; y <= 22; y++) map[y][27] = W
  map[23][27] = F
  map[19][37] = CF; map[20][37] = CF
  map[21][30] = DV; map[21][34] = DV
  map[20][30] = CH; map[22][30] = CH; map[20][34] = CH; map[22][34] = CH
  map[19][28] = BS; map[19][29] = BS
  map[25][37] = P; map[25][28] = P

  // Center corridor rugs
  for (let x = 15; x <= 24; x++) { map[17][x] = R; map[26][x] = R }

  // Entrance plants
  map[26][5] = P; map[26][34] = P
  map[27][1] = P; map[27][38] = P

  return map
}

function isWalkable(tile: number): boolean {
  switch (tile) {
    case T.WALL:
    case T.DESK_H:
    case T.DESK_V:
    case T.BOOKSHELF:
    case T.COFFEE:
    case T.WHITEBOARD:
    case T.GLASS_WALL:
    case T.SOFA:
      return false
    default:
      return true
  }
}

// ─── Room ───────────────────────────────────────────────────────────────────

export class OfficeRoom extends Room {
  private mapData: number[][] = []
  private players = new Map<string, PlayerData>()
  private userSessionMap = new Map<string, string>() // userId -> sessionId
  private chatHistory: ChatMessageData[] = []

  onCreate() {
    // No setState — all sync via messages (avoids @colyseus/schema client issues)
    this.mapData = generateMap()
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
      if (!isWalkable(this.mapData[newY][newX])) return

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

      this.broadcast('playerMoved', {
        sessionId: player.sessionId,
        x: player.x,
        y: player.y,
        direction: player.direction,
        isMoving: true,
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

      const channel = data.channel === 'proximity' ? 'proximity' : 'global'

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
