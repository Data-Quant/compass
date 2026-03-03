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
  floorWood1:    '#d4b892',
  floorWood2:    '#c0a478',
  floorWood3:    '#a88e6c',
  floorCarpet1:  '#645858',
  floorCarpet2:  '#584c4c',
  meetingFloor:  '#6a7a8a',
  loungeFloor:   '#b0a090',

  // Walls
  wallFace:      '#50463e',
  wallTop:       '#3c3430',
  wallDark:      '#2a2420',

  // Furniture
  deskTop:       '#8a6a48',
  deskLeg:       '#806848',
  monitorFrame:  '#40383a',
  monitorScreen: '#89c4fa',
  monitorGlow:   '#89b4fa',
  chairSeat:     '#4a4a62',
  chairBack:     '#484858',

  // Decor
  plantGreen1:   '#6eb87a',
  plantGreen2:   '#5a9c66',
  plantPot:      '#a08068',
  sofaBody:      '#8070b0',
  sofaCushion:   '#9888c0',
  bookshelf:     '#6a5438',
  bookColors:    ['#f38ba8', '#89b4fa', '#a6e3a1', '#f9e2af', '#cba6f7', '#fab387'],
  rug1:          '#c08060',
  rug2:          '#d09868',
  whiteboardBg:  '#e8e0d8',
  whiteboardFrame: '#888078',
  coffeeMachine: '#484040',

  // Extended detail colors
  plantGreen3:   '#4a8850',
  leafHighlight: '#90e89a',
  potSoil:       '#5a4030',
  wallHighlight: '#887e74',

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

// ─── Hair & Body System ─────────────────────────────────────────────────────

export const HAIR_COLORS = [
  '#1a1a1a', '#4a3728', '#8b6914', '#c4943a',
  '#dfc090', '#b8450a', '#666666', '#e8e0d8',
]

export const HAIR_STYLES = 5

export function getHairColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 3) - hash + userId.charCodeAt(i)) | 0
  }
  return HAIR_COLORS[Math.abs(hash) % HAIR_COLORS.length]
}

export function getHairStyle(userId: string): number {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 11) - hash + userId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % HAIR_STYLES
}

export type BodyType = 'male' | 'female'

export function getBodyType(userId: string): BodyType {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 9) - hash + userId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 2 === 0 ? 'male' : 'female'
}

// ─── Sprite Asset Manifest ───────────────────────────────────────────────────

export const SPRITE_ASSETS: Record<string, { path: string; scale: number }> = {
  sprite_desk_h:    { path: '/office/desk-with-pc.png', scale: 0.5 },
  sprite_desk_v:    { path: '/office/writing-table.png', scale: 0.5 },
  sprite_chair:     { path: '/office/Chair.png', scale: 2.0 },
  sprite_plant:     { path: '/office/plant.png', scale: 1.0 },
  sprite_coffee:    { path: '/office/coffee-maker.png', scale: 0.5 },
  sprite_bookshelf: { path: '/office/cabinet.png', scale: 0.5 },
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

export interface MapData {
  tileMap: number[][]
  floorMap: number[][]
}

export function generateDefaultMap(): MapData {
  const F = T.FLOOR, W = T.WALL, DH = T.DESK_H, DV = T.DESK_V
  const M = T.MEETING, L = T.LOUNGE, P = T.PLANT, CH = T.CHAIR
  const S = T.SOFA, BS = T.BOOKSHELF, CF = T.COFFEE, WB = T.WHITEBOARD
  const R = T.RUG, WB2 = T.WALL_BOTTOM, CP = T.CARPET, GW = T.GLASS_WALL

  const map: number[][] = []
  const floor: number[][] = []
  for (let y = 0; y < MAP_HEIGHT; y++) {
    map[y] = new Array(MAP_WIDTH).fill(F)
    floor[y] = new Array(MAP_WIDTH).fill(F)
  }

  // Helper: set wall on both maps
  const setWall = (y: number, x: number) => { map[y][x] = W; floor[y][x] = W }
  // Helper: set zone floor on both maps
  const setFloor = (y: number, x: number, t: number) => { map[y][x] = t; floor[y][x] = t }
  // Helper: set object on tileMap only (floor preserved)
  const setObj = (y: number, x: number, t: number) => { map[y][x] = t }

  // ── Border walls ─────────────────────────────────────────────────
  for (let x = 0; x < MAP_WIDTH; x++) {
    setWall(0, x); setWall(1, x)
    setWall(MAP_HEIGHT - 1, x); setWall(MAP_HEIGHT - 2, x)
  }
  for (let y = 0; y < MAP_HEIGHT; y++) {
    setWall(y, 0); setWall(y, MAP_WIDTH - 1)
  }

  // ── Left Meeting Room (interior: cols 2-8, rows 2-7) ────────────
  for (let x = 1; x <= 9; x++) { setWall(2, x); setWall(7, x) }
  for (let y = 2; y <= 7; y++) { setWall(y, 1); setWall(y, 9) }
  // Glass wall on right side with door
  for (let y = 3; y <= 5; y++) setObj(y, 9, GW)
  map[6][9] = F // door
  // Meeting room floor
  for (let y = 3; y <= 6; y++) for (let x = 2; x <= 8; x++) setFloor(y, x, M)
  // Meeting table (objects on meeting floor)
  for (let x = 3; x <= 7; x++) setObj(4, x, DH)
  for (let x = 3; x <= 7; x++) setObj(5, x, DH)
  // Chairs around table
  setObj(3, 4, CH); setObj(3, 6, CH)
  setObj(6, 4, CH); setObj(6, 6, CH)
  // Whiteboard
  setObj(3, 2, WB)

  // ── Right Meeting Room (interior: cols 31-37, rows 2-7) ─────────
  for (let x = 30; x <= 38; x++) { setWall(2, x); setWall(7, x) }
  for (let y = 2; y <= 7; y++) { setWall(y, 30); setWall(y, 38) }
  // Glass wall on left with door
  for (let y = 3; y <= 5; y++) setObj(y, 30, GW)
  map[6][30] = F
  for (let y = 3; y <= 6; y++) for (let x = 31; x <= 37; x++) setFloor(y, x, M)
  for (let x = 32; x <= 36; x++) setObj(4, x, DH)
  for (let x = 32; x <= 36; x++) setObj(5, x, DH)
  setObj(3, 33, CH); setObj(3, 35, CH)
  setObj(6, 33, CH); setObj(6, 35, CH)
  setObj(3, 37, WB)

  // ── Plants along top corridor ───────────────────────────────────
  setObj(2, 11, P); setObj(2, 14, P); setObj(2, 25, P); setObj(2, 28, P)

  // ── Main Workspace — Left desk cluster (cols 3-7, rows 10-15) ──
  for (const row of [10, 13]) {
    for (let x = 3; x <= 6; x++) setObj(row, x, DH)
    setObj(row + 1, 3, CH); setObj(row + 1, 5, CH)
    setObj(row - 1, 4, CH); setObj(row - 1, 6, CH)
  }

  // ── Main Workspace — Center cluster (cols 16-23, rows 10-15) ───
  for (const row of [10, 13]) {
    for (let x = 16; x <= 23; x++) setObj(row, x, DH)
    setObj(row + 1, 17, CH); setObj(row + 1, 19, CH); setObj(row + 1, 21, CH)
    setObj(row - 1, 18, CH); setObj(row - 1, 20, CH); setObj(row - 1, 22, CH)
  }

  // ── Main Workspace — Right cluster (cols 33-36, rows 10-15) ────
  for (const row of [10, 13]) {
    for (let x = 33; x <= 36; x++) setObj(row, x, DH)
    setObj(row + 1, 33, CH); setObj(row + 1, 35, CH)
    setObj(row - 1, 34, CH); setObj(row - 1, 36, CH)
  }

  // ── Bookshelf wall (right side, rows 10-15) ────────────────────
  for (let y = 10; y <= 15; y++) setObj(y, 38, BS)

  // ── Plants in workspace ─────────────────────────────────────────
  setObj(10, 10, P); setObj(15, 10, P); setObj(10, 28, P); setObj(15, 28, P)
  setObj(12, 14, P); setObj(12, 25, P)

  // ── Lounge Area (bottom-left, cols 2-12, rows 19-25) ───────────
  for (let y = 19; y <= 25; y++) for (let x = 2; x <= 12; x++) setFloor(y, x, L)
  // Sofas in L-shape (objects on lounge floor)
  setObj(20, 3, S); setObj(20, 4, S); setObj(20, 5, S)
  setObj(21, 3, S)
  setObj(22, 3, S); setObj(22, 4, S); setObj(22, 5, S)
  // Rug in lounge (floor type)
  for (let y = 20; y <= 22; y++) for (let x = 6; x <= 8; x++) {
    if (map[y][x] === L) setFloor(y, x, R)
  }
  // Coffee table (using desk tile as table)
  setObj(21, 7, DV)
  // Plants
  setObj(19, 2, P); setObj(19, 12, P); setObj(25, 2, P)

  // ── Break Room (bottom-right, cols 28-37, rows 19-25) ──────────
  for (let y = 18; y <= 25; y++) for (let x = 27; x <= 37; x++) setFloor(y, x, CP)
  // Partial wall
  for (let y = 18; y <= 22; y++) setWall(y, 27)
  map[23][27] = F; floor[23][27] = F // door
  // Coffee machine
  setObj(19, 37, CF); setObj(20, 37, CF)
  // Small tables
  setObj(21, 30, DV); setObj(21, 34, DV)
  // Chairs around tables
  setObj(20, 30, CH); setObj(22, 30, CH); setObj(20, 34, CH); setObj(22, 34, CH)
  // Bookshelf on wall
  setObj(19, 28, BS); setObj(19, 29, BS)
  setObj(25, 37, P); setObj(25, 28, P)

  // ── Center corridor rug ─────────────────────────────────────────
  for (let x = 15; x <= 24; x++) {
    setFloor(17, x, R)
    setFloor(26, x, R)
  }

  // ── Entrance plants ─────────────────────────────────────────────
  setObj(26, 5, P); setObj(26, 34, P)
  setObj(27, 1, P); setObj(27, 38, P)

  return { tileMap: map, floorMap: floor }
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
