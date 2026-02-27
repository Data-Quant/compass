// ─── Virtual Office Constants ────────────────────────────────────────────────

export const TILE_SIZE = 32
export const MAP_WIDTH = 40   // tiles
export const MAP_HEIGHT = 30  // tiles
export const SPAWN_X = 20
export const SPAWN_Y = 25
export const PROXIMITY_RADIUS = 5
export const MOVE_INTERVAL = 100
export const CHAT_BUBBLE_DURATION = 4000
export const MAX_CHAT_HISTORY = 50

export const OFFICE_STATUSES = ['ONLINE', 'AWAY', 'BUSY', 'DND'] as const
export type OfficeStatus = (typeof OFFICE_STATUSES)[number]

export const STATUS_COLORS: Record<OfficeStatus, string> = {
  ONLINE: '#a6e3a1',
  AWAY:   '#f9e2af',
  BUSY:   '#f38ba8',
  DND:    '#6c7086',
}

export const CHAT_CHANNELS = ['global', 'proximity'] as const
export type ChatChannel = (typeof CHAT_CHANNELS)[number]

// ─── Color Palette (warm office tones) ───────────────────────────────────────

export const PALETTE = {
  // Floors
  floorWood1:    '#c4a882',
  floorWood2:    '#b89b76',
  floorWood3:    '#a88e6c',
  floorCarpet1:  '#7c7068',
  floorCarpet2:  '#6e6258',
  meetingFloor:  '#8b8178',
  loungeFloor:   '#9b8e84',

  // Walls
  wallFace:      '#6e635a',
  wallTop:       '#504840',
  wallDark:      '#3c3632',

  // Furniture
  deskTop:       '#a08060',
  deskLeg:       '#806848',
  monitorFrame:  '#40383a',
  monitorScreen: '#7aacde',
  monitorGlow:   '#89b4fa',
  chairSeat:     '#585868',
  chairBack:     '#484858',

  // Decor
  plantGreen1:   '#6eb87a',
  plantGreen2:   '#5a9c66',
  plantPot:      '#a08068',
  sofaBody:      '#7868a0',
  sofaCushion:   '#8878b0',
  bookshelf:     '#806850',
  bookColors:    ['#f38ba8', '#89b4fa', '#a6e3a1', '#f9e2af', '#cba6f7', '#fab387'],
  rug1:          '#b8886c',
  rug2:          '#c89878',
  whiteboardBg:  '#e8e0d8',
  whiteboardFrame: '#888078',
  coffeeMachine: '#585050',

  // Lighting
  ambientWarm:   '#f9e2af',
  shadowColor:   '#18141c',
}

// ─── Avatar color palette ────────────────────────────────────────────────────

export const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#eab308', '#84cc16', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#2563eb', '#7c3aed',
]

// Skin tones for character sprites
export const SKIN_TONES = ['#f5d0b0', '#e8b88a', '#d4a06a', '#b07848', '#8c5c38', '#6a4028']

export function getAvatarColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getSkinTone(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 7) - hash + userId.charCodeAt(i)) | 0
  }
  return SKIN_TONES[Math.abs(hash) % SKIN_TONES.length]
}

// ─── Tile Types ──────────────────────────────────────────────────────────────

export const T = {
  FLOOR:       0,
  WALL:        1,
  DESK_H:      2,   // horizontal desk with monitor
  DESK_V:      3,   // vertical desk section
  MEETING:     4,   // meeting room floor
  LOUNGE:      5,   // lounge floor
  PLANT:       6,
  CHAIR:       7,
  SOFA:        8,
  BOOKSHELF:   9,
  COFFEE:      10,
  WHITEBOARD:  11,
  RUG:         12,
  WALL_BOTTOM: 13,  // bottom face of wall (walkable side)
  CARPET:      14,  // carpeted hallway
  GLASS_WALL:  15,  // glass partition (non-walkable but see-through)
} as const

export type TileType = (typeof T)[keyof typeof T]

// ─── Map Layout ──────────────────────────────────────────────────────────────
// 40 wide x 30 tall
//
// Layout:
//   Row 0-1:   Top wall
//   Row 2-7:   Meeting rooms (left + right) + open area center
//   Row 8:     Corridor
//   Row 9-16:  Main workspace (desk clusters)
//   Row 17:    Corridor
//   Row 18-23: Lounge (left) + Break room (right) + center desks
//   Row 24-27: Open hall / entrance area
//   Row 28-29: Bottom wall

export function generateDefaultMap(): number[][] {
  const F = T.FLOOR, W = T.WALL, DH = T.DESK_H, DV = T.DESK_V
  const M = T.MEETING, L = T.LOUNGE, P = T.PLANT, CH = T.CHAIR
  const S = T.SOFA, BS = T.BOOKSHELF, CF = T.COFFEE, WB = T.WHITEBOARD
  const R = T.RUG, WB2 = T.WALL_BOTTOM, CP = T.CARPET, GW = T.GLASS_WALL

  const map: number[][] = []
  for (let y = 0; y < MAP_HEIGHT; y++) {
    map[y] = new Array(MAP_WIDTH).fill(F)
  }

  // ── Border walls ─────────────────────────────────────────────────
  for (let x = 0; x < MAP_WIDTH; x++) {
    map[0][x] = W
    map[1][x] = W
    map[MAP_HEIGHT - 1][x] = W
    map[MAP_HEIGHT - 2][x] = W
  }
  for (let y = 0; y < MAP_HEIGHT; y++) {
    map[y][0] = W
    map[y][MAP_WIDTH - 1] = W
  }

  // ── Left Meeting Room (interior: cols 2-8, rows 2-7) ────────────
  for (let x = 1; x <= 9; x++) { map[2][x] = W; map[7][x] = W }
  for (let y = 2; y <= 7; y++) { map[y][1] = W; map[y][9] = W }
  // Glass wall on right side with door
  for (let y = 3; y <= 5; y++) map[y][9] = GW
  map[6][9] = F // door
  // Meeting room floor
  for (let y = 3; y <= 6; y++) for (let x = 2; x <= 8; x++) map[y][x] = M
  // Meeting table
  for (let x = 3; x <= 7; x++) map[4][x] = DH
  for (let x = 3; x <= 7; x++) map[5][x] = DH
  // Chairs around table
  map[3][4] = CH; map[3][6] = CH
  map[6][4] = CH; map[6][6] = CH
  // Whiteboard
  map[3][2] = WB

  // ── Right Meeting Room (interior: cols 31-37, rows 2-7) ─────────
  for (let x = 30; x <= 38; x++) { map[2][x] = W; map[7][x] = W }
  for (let y = 2; y <= 7; y++) { map[y][30] = W; map[y][38] = W }
  // Glass wall on left with door
  for (let y = 3; y <= 5; y++) map[y][30] = GW
  map[6][30] = F
  for (let y = 3; y <= 6; y++) for (let x = 31; x <= 37; x++) map[y][x] = M
  for (let x = 32; x <= 36; x++) map[4][x] = DH
  for (let x = 32; x <= 36; x++) map[5][x] = DH
  map[3][33] = CH; map[3][35] = CH
  map[6][33] = CH; map[6][35] = CH
  map[3][37] = WB

  // ── Plants along top corridor ───────────────────────────────────
  map[2][11] = P; map[2][14] = P; map[2][25] = P; map[2][28] = P

  // ── Main Workspace — Left desk cluster (cols 3-7, rows 10-15) ──
  for (let row of [10, 13]) {
    for (let x = 3; x <= 6; x++) map[row][x] = DH
    map[row + 1][3] = CH; map[row + 1][5] = CH
    map[row - 1][4] = CH; map[row - 1][6] = CH
  }

  // ── Main Workspace — Center cluster (cols 16-23, rows 10-15) ───
  for (let row of [10, 13]) {
    for (let x = 16; x <= 23; x++) map[row][x] = DH
    map[row + 1][17] = CH; map[row + 1][19] = CH; map[row + 1][21] = CH
    map[row - 1][18] = CH; map[row - 1][20] = CH; map[row - 1][22] = CH
  }

  // ── Main Workspace — Right cluster (cols 33-36, rows 10-15) ────
  for (let row of [10, 13]) {
    for (let x = 33; x <= 36; x++) map[row][x] = DH
    map[row + 1][33] = CH; map[row + 1][35] = CH
    map[row - 1][34] = CH; map[row - 1][36] = CH
  }

  // ── Bookshelf wall (right side, rows 10-15) ────────────────────
  for (let y = 10; y <= 15; y++) map[y][38] = BS

  // ── Plants in workspace ─────────────────────────────────────────
  map[10][10] = P; map[15][10] = P; map[10][28] = P; map[15][28] = P
  map[12][14] = P; map[12][25] = P

  // ── Lounge Area (bottom-left, cols 2-12, rows 19-25) ───────────
  for (let y = 19; y <= 25; y++) for (let x = 2; x <= 12; x++) map[y][x] = L
  // Sofas in L-shape
  map[20][3] = S; map[20][4] = S; map[20][5] = S
  map[21][3] = S
  map[22][3] = S; map[22][4] = S; map[22][5] = S
  // Rug in lounge
  for (let y = 20; y <= 22; y++) for (let x = 6; x <= 8; x++) {
    if (map[y][x] === L) map[y][x] = R
  }
  // Coffee table (using desk tile as table)
  map[21][7] = DV
  // Plants
  map[19][2] = P; map[19][12] = P; map[25][2] = P

  // ── Break Room (bottom-right, cols 28-37, rows 19-25) ──────────
  for (let y = 18; y <= 25; y++) for (let x = 27; x <= 37; x++) map[y][x] = CP
  // Partial wall
  for (let y = 18; y <= 22; y++) map[y][27] = W
  map[23][27] = F // door
  // Coffee machine
  map[19][37] = CF; map[20][37] = CF
  // Small tables
  map[21][30] = DV; map[21][34] = DV
  // Chairs around tables
  map[20][30] = CH; map[22][30] = CH; map[20][34] = CH; map[22][34] = CH
  // Bookshelf on wall
  map[19][28] = BS; map[19][29] = BS
  map[25][37] = P; map[25][28] = P

  // ── Center corridor rug ─────────────────────────────────────────
  for (let x = 15; x <= 24; x++) {
    map[17][x] = R
    map[26][x] = R
  }

  // ── Entrance plants ─────────────────────────────────────────────
  map[26][5] = P; map[26][34] = P
  map[27][1] = P; map[27][38] = P

  return map
}

// ─── Audio Zones (Phase 2 — proximity voice) ─────────────────────────────────

export const MAX_AUDIO_RADIUS = 8

export interface AudioZone {
  id: string
  label: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export const AUDIO_ZONES: AudioZone[] = [
  { id: 'meeting-left',  label: 'Meeting Room L', x1: 2, y1: 3, x2: 8,  y2: 6 },
  { id: 'meeting-right', label: 'Meeting Room R', x1: 31, y1: 3, x2: 37, y2: 6 },
]

export function getAudioZone(x: number, y: number): AudioZone | null {
  for (const zone of AUDIO_ZONES) {
    if (x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) {
      return zone
    }
  }
  return null
}

// Check if a tile is walkable
export function isWalkable(tileType: number): boolean {
  switch (tileType) {
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
