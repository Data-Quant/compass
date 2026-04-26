import * as Phaser from 'phaser'
import { TILE_SIZE, T, PALETTE, type BodyType } from '@/lib/office-config'
import type {
  AvatarAccessory,
  AvatarBodyFrame,
  AvatarHeadCoveringType,
  AvatarOutfitType,
} from '@/shared/avatar-v2'

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function parseHex(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  return [
    parseInt(c.substring(0, 2), 16),
    parseInt(c.substring(2, 4), 16),
    parseInt(c.substring(4, 6), 16),
  ]
}

function toHex(r: number, g: number, b: number): string {
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [r, g, b].map(v => cl(v).toString(16).padStart(2, '0')).join('')
}

function lighten(c: string, n: number): string {
  const [r, g, b] = parseHex(c)
  return toHex(r + n, g + n, b + n)
}

function darken(c: string, n: number): string {
  const [r, g, b] = parseHex(c)
  return toHex(r - n, g - n, b - n)
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOISE & DITHERING (kept for wall shadow, glass)
// ═══════════════════════════════════════════════════════════════════════════════

const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6],
  [3, 11, 1, 9], [15, 7, 13, 5],
]

function orderedDither(x: number, y: number, value: number): boolean {
  return value > BAYER[y & 3][x & 3] / 16
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANVAS TEXTURE HELPER
// ═══════════════════════════════════════════════════════════════════════════════

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  draw(ctx)
  scene.textures.addCanvas(key, c)
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOOR TEXTURE GENERATION — Clean RPG-style floors (no noise/dithering)
// ═══════════════════════════════════════════════════════════════════════════════

export function generateFloorTextures(scene: Phaser.Scene) {
  const S = TILE_SIZE

  // ─── FLOOR (warm wood planks) ───────────────────────────────────
  canvasTex(scene, 'tile_floor', S, S, (ctx) => {
    ctx.fillStyle = PALETTE.floorWood1
    ctx.fillRect(0, 0, S, S)
    const plankH = [7, 9, 8, 8]
    let py = 0
    for (let i = 0; i < 4; i++) {
      const h = plankH[i]
      ctx.fillStyle = i % 2 === 0 ? PALETTE.floorWood1 : PALETTE.floorWood3
      ctx.fillRect(0, py, S, h)
      // Joint line between planks
      if (py > 0) {
        ctx.fillStyle = darken(PALETTE.floorWood3, 18)
        ctx.fillRect(0, py, S, 1)
      }
      // Staggered vertical joint
      const jx = i % 2 === 0 ? 18 : 10
      ctx.fillStyle = darken(PALETTE.floorWood1, 20)
      ctx.fillRect(jx, py + 1, 1, h - 1)
      py += h
    }
  })

  // ─── CARPET ─────────────────────────────────────────────────────
  canvasTex(scene, 'tile_carpet', S, S, (ctx) => {
    ctx.fillStyle = PALETTE.floorCarpet1
    ctx.fillRect(0, 0, S, S)
    // 2px checkerboard weave
    for (let py = 0; py < S; py += 2) {
      for (let px = 0; px < S; px += 2) {
        const isH = (Math.floor(py / 2) + Math.floor(px / 2)) % 2 === 0
        ctx.fillStyle = isH ? PALETTE.floorCarpet2 : PALETTE.floorCarpet1
        ctx.fillRect(px, py, 2, 2)
      }
    }
  })

  // ─── MEETING (cool blue-grey tile grid) ─────────────────────────
  canvasTex(scene, 'tile_meeting', S, S, (ctx) => {
    ctx.fillStyle = PALETTE.meetingFloor
    ctx.fillRect(0, 0, S, S)
    const grout = darken(PALETTE.meetingFloor, 15)
    const sheen = lighten(PALETTE.meetingFloor, 8)
    // 2x2 tile grid
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        const ox = tx * 16, oy = ty * 16
        // Grout lines
        ctx.fillStyle = grout
        ctx.fillRect(ox, oy, 16, 1)
        ctx.fillRect(ox, oy, 1, 16)
        // Tile fill — alternate subtle shade
        ctx.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.meetingFloor : lighten(PALETTE.meetingFloor, 3)
        ctx.fillRect(ox + 1, oy + 1, 15, 15)
        // Light sheen on alternating tiles
        if ((tx + ty) % 2 === 0) {
          ctx.fillStyle = sheen
          ctx.globalAlpha = 0.20
          ctx.fillRect(ox + 2, oy + 2, 5, 1)
          ctx.fillRect(ox + 2, oy + 3, 1, 3)
          ctx.globalAlpha = 1
        }
      }
    }
  })

  // ─── LOUNGE (warm polished concrete) ────────────────────────────
  canvasTex(scene, 'tile_lounge', S, S, (ctx) => {
    ctx.fillStyle = PALETTE.loungeFloor
    ctx.fillRect(0, 0, S, S)
    // Subtle horizontal bands every 4px
    for (let y = 0; y < S; y++) {
      if (y % 4 === 0) {
        ctx.fillStyle = darken(PALETTE.loungeFloor, 4)
        ctx.fillRect(0, y, S, 1)
      }
    }
    // Small highlight patch
    ctx.globalAlpha = 0.15
    ctx.fillStyle = lighten(PALETTE.loungeFloor, 20)
    ctx.fillRect(8, 12, 6, 3)
    ctx.globalAlpha = 1
  })

  // ─── RUG ────────────────────────────────────────────────────────
  canvasTex(scene, 'tile_rug', S, S, (ctx) => {
    ctx.fillStyle = PALETTE.rug1
    ctx.fillRect(0, 0, S, S)
    // Border (3px)
    ctx.fillStyle = PALETTE.rug2
    ctx.fillRect(0, 0, S, 3)
    ctx.fillRect(0, S - 3, S, 3)
    ctx.fillRect(0, 0, 3, S)
    ctx.fillRect(S - 3, 0, 3, S)
    // Center diamond motif
    ctx.fillStyle = '#d8a880'
    ctx.globalAlpha = 0.35
    const mid = S / 2
    for (let dy = -4; dy <= 4; dy++) {
      const w = 4 - Math.abs(dy)
      ctx.fillRect(mid - w, mid + dy, w * 2, 1)
    }
    ctx.globalAlpha = 1
  })

  // ─── WALL SHADOW (overlay for tiles below walls) ────────────────
  canvasTex(scene, 'tile_wall_shadow', S, 12, (ctx) => {
    const img = ctx.createImageData(S, 12)
    const d = img.data
    for (let y = 0; y < 12; y++) {
      const intensity = 0.55 * (1 - y / 12)
      for (let x = 0; x < S; x++) {
        if (orderedDither(x, y, intensity)) {
          const i = (y * S + x) * 4
          d[i] = 24; d[i + 1] = 20; d[i + 2] = 28; d[i + 3] = 130
        }
      }
    }
    ctx.putImageData(img, 0, 0)
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBJECT TEXTURE GENERATION — Procedural objects on transparent backgrounds
// (Tiles replaced by PNG sprites are NOT generated here)
// ═══════════════════════════════════════════════════════════════════════════════

export function generateObjectTextures(scene: Phaser.Scene) {
  const S = TILE_SIZE

  // ─── WALL (opaque — walls have no floor underneath) ─────────────
  canvasTex(scene, 'tile_wall', S, S, (ctx) => {
    // Top face
    ctx.fillStyle = PALETTE.wallTop
    ctx.fillRect(0, 0, S, 10)
    // Crisp mortar lines
    ctx.fillStyle = darken(PALETTE.wallTop, 8)
    ctx.fillRect(0, 3, S, 1)
    ctx.fillRect(0, 7, S, 1)
    ctx.fillStyle = lighten(PALETTE.wallTop, 6)
    ctx.fillRect(8, 1, 12, 1)
    ctx.fillRect(22, 5, 8, 1)
    // Edge highlight
    ctx.fillStyle = PALETTE.wallHighlight
    ctx.fillRect(0, 10, S, 1)
    // Front face
    ctx.fillStyle = PALETTE.wallFace
    ctx.fillRect(0, 11, S, S - 11)
    // Mortar lines
    ctx.fillStyle = darken(PALETTE.wallFace, 10)
    ctx.fillRect(0, 17, S, 1)
    ctx.fillRect(0, 24, S, 1)
    ctx.fillRect(10, 11, 1, 6)
    ctx.fillRect(22, 11, 1, 6)
    ctx.fillRect(5, 18, 1, 6)
    ctx.fillRect(16, 18, 1, 6)
    ctx.fillRect(28, 18, 1, 6)
    // Bottom shadow
    ctx.fillStyle = PALETTE.wallDark
    ctx.globalAlpha = 0.5
    ctx.fillRect(0, S - 2, S, 2)
    ctx.globalAlpha = 1
  })

  // ─── GLASS WALL (transparent bg — floor shows through) ──────────
  canvasTex(scene, 'tile_glass', S, S, (ctx) => {
    // Transparent base — start with blue-tinted glass area
    const img = ctx.createImageData(S, S)
    const d = img.data
    const [br, bg, bb] = parseHex('#89b4fa')
    for (let y = 0; y < S; y++) {
      for (let x = 2; x < S - 2; x++) {
        if (orderedDither(x, y, 0.3)) {
          const i = (y * S + x) * 4
          d[i] = br; d[i + 1] = bg; d[i + 2] = bb; d[i + 3] = 60
        }
      }
    }
    ctx.putImageData(img, 0, 0)
    // Metal frame
    ctx.fillStyle = '#a0a0a0'
    ctx.fillRect(0, 0, 1, S)
    ctx.fillRect(S - 2, 0, 1, S)
    ctx.fillStyle = '#686868'
    ctx.fillRect(1, 0, 1, S)
    ctx.fillRect(S - 1, 0, 1, S)
    // Crossbar
    ctx.fillStyle = '#888888'
    ctx.fillRect(2, 15, S - 4, 2)
    ctx.fillStyle = '#a0a0a0'
    ctx.fillRect(2, 15, S - 4, 1)
    // Reflections
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.12
    ctx.fillRect(6, 2, 2, 12)
    ctx.fillRect(7, 18, 2, 10)
    ctx.globalAlpha = 0.06
    ctx.fillRect(22, 4, 1, 8)
    ctx.globalAlpha = 1
  })

  // ─── SOFA (transparent bg — brighter colors) ────────────────────
  canvasTex(scene, 'tile_sofa', S, S, (ctx) => {
    // Shadow
    ctx.fillStyle = 'rgba(24, 20, 28, 0.2)'
    ctx.fillRect(3, S - 3, S - 6, 2)
    // Body
    const bodyColor = lighten(PALETTE.sofaBody, 10)
    const cushionColor = lighten(PALETTE.sofaCushion, 10)
    ctx.fillStyle = bodyColor
    ctx.fillRect(2, 8, S - 4, S - 12)
    // Backrest
    ctx.fillStyle = darken(bodyColor, 8)
    ctx.fillRect(2, 6, S - 4, 5)
    ctx.fillStyle = darken(bodyColor, 4)
    ctx.fillRect(3, 5, S - 6, 1)
    // Tufting buttons
    ctx.fillStyle = darken(bodyColor, 18)
    ctx.fillRect(10, 8, 1, 1)
    ctx.fillRect(16, 8, 1, 1)
    ctx.fillRect(22, 8, 1, 1)
    // Two cushions
    ctx.fillStyle = cushionColor
    ctx.fillRect(4, 11, 11, S - 17)
    ctx.fillRect(17, 11, 11, S - 17)
    ctx.fillStyle = lighten(cushionColor, 10)
    ctx.fillRect(5, 12, 9, 1)
    ctx.fillRect(18, 12, 9, 1)
    ctx.fillStyle = darken(cushionColor, 10)
    ctx.fillRect(4, S - 7, 11, 1)
    ctx.fillRect(17, S - 7, 11, 1)
    ctx.fillStyle = darken(cushionColor, 6)
    ctx.fillRect(15, 11, 2, S - 17)
    // Armrests
    ctx.fillStyle = darken(bodyColor, 5)
    ctx.fillRect(2, 8, 3, S - 12)
    ctx.fillRect(S - 5, 8, 3, S - 12)
    ctx.fillStyle = lighten(bodyColor, 8)
    ctx.fillRect(2, 8, 1, S - 12)
    ctx.fillRect(S - 3, 8, 1, S - 12)
  })

  // ─── WHITEBOARD (transparent bg) ────────────────────────────────
  canvasTex(scene, 'tile_whiteboard', S, S, (ctx) => {
    // Frame
    ctx.fillStyle = PALETTE.whiteboardFrame
    ctx.fillRect(2, 2, S - 4, S - 8)
    ctx.fillStyle = lighten(PALETTE.whiteboardFrame, 10)
    ctx.fillRect(2, 2, S - 4, 1)
    ctx.fillRect(2, 2, 1, S - 8)
    ctx.fillStyle = darken(PALETTE.whiteboardFrame, 10)
    ctx.fillRect(2, S - 7, S - 4, 1)
    ctx.fillRect(S - 3, 2, 1, S - 8)
    // Board surface
    ctx.fillStyle = PALETTE.whiteboardBg
    ctx.fillRect(4, 4, S - 8, S - 12)
    // Reflection
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.06
    ctx.fillRect(6, 5, 2, S - 14)
    ctx.globalAlpha = 1
    // Marker text
    ctx.fillStyle = '#4060c0'
    ctx.globalAlpha = 0.5
    ctx.fillRect(7, 7, 12, 1)
    ctx.fillRect(8, 8, 10, 1)
    ctx.fillRect(7, 11, 8, 1)
    ctx.globalAlpha = 1
    ctx.fillStyle = '#c04040'
    ctx.globalAlpha = 0.5
    ctx.fillRect(7, 15, 14, 1)
    ctx.fillRect(8, 16, 12, 1)
    ctx.fillRect(7, 19, 6, 1)
    ctx.globalAlpha = 1
    // Bullet points
    ctx.fillStyle = '#404040'
    ctx.globalAlpha = 0.4
    ctx.fillRect(5, 7, 1, 1)
    ctx.fillRect(5, 11, 1, 1)
    ctx.fillRect(5, 15, 1, 1)
    ctx.fillRect(5, 19, 1, 1)
    ctx.globalAlpha = 1
    // Marker tray
    ctx.fillStyle = darken(PALETTE.whiteboardFrame, 5)
    ctx.fillRect(4, S - 7, S - 8, 3)
    ctx.fillStyle = '#4060c0'
    ctx.fillRect(8, S - 7, 4, 2)
    ctx.fillStyle = '#c04040'
    ctx.fillRect(14, S - 7, 4, 2)
    ctx.fillStyle = '#40a040'
    ctx.fillRect(20, S - 7, 4, 2)
  })

  canvasTex(scene, 'tile_logo_sign', S, S, (ctx) => {
    ctx.fillStyle = '#f6f8ff'
    ctx.fillRect(2, 7, S - 4, 18)
    ctx.fillStyle = '#2778f6'
    ctx.fillRect(5, 10, 6, 10)
    ctx.fillRect(5, 20, 8, 2)
    ctx.fillStyle = '#273047'
    ctx.fillRect(15, 11, 10, 3)
    ctx.fillRect(15, 16, 7, 2)
    ctx.fillRect(15, 20, 11, 2)
    ctx.fillStyle = 'rgba(39,120,246,0.16)'
    ctx.fillRect(2, 24, S - 4, 2)
  })

  canvasTex(scene, 'tile_door', S, S, (ctx) => {
    ctx.fillStyle = '#d9b982'
    ctx.fillRect(5, 3, S - 10, S - 5)
    ctx.fillStyle = darken('#d9b982', 18)
    ctx.fillRect(5, 3, 2, S - 5)
    ctx.fillRect(S - 7, 3, 2, S - 5)
    ctx.fillRect(5, S - 4, S - 10, 2)
    ctx.fillStyle = '#f8df96'
    ctx.fillRect(S - 10, 15, 2, 2)
  })

  canvasTex(scene, 'tile_cubicle', S, S, (ctx) => {
    ctx.fillStyle = '#7b8294'
    ctx.fillRect(2, 4, S - 4, 4)
    ctx.fillRect(2, 4, 4, S - 8)
    ctx.fillStyle = '#bfc7d5'
    ctx.fillRect(6, 8, S - 10, 12)
    ctx.fillStyle = '#8b5e3c'
    ctx.fillRect(8, 19, S - 12, 4)
    ctx.fillStyle = '#4f9cf9'
    ctx.fillRect(10, 11, 6, 5)
    ctx.fillStyle = '#43b581'
    ctx.fillRect(22, 12, 4, 7)
    ctx.fillStyle = '#2f6f3e'
    ctx.fillRect(21, 11, 6, 2)
  })

  canvasTex(scene, 'tile_office_desk', S, S, (ctx) => {
    ctx.fillStyle = '#6b4a2f'
    ctx.fillRect(4, 9, S - 8, 12)
    ctx.fillStyle = '#8a6442'
    ctx.fillRect(4, 8, S - 8, 3)
    ctx.fillStyle = '#2d3348'
    ctx.fillRect(12, 5, 8, 5)
    ctx.fillStyle = '#60a5fa'
    ctx.fillRect(13, 6, 6, 3)
    ctx.fillStyle = '#3b2a1c'
    ctx.fillRect(6, 21, 3, 5)
    ctx.fillRect(S - 9, 21, 3, 5)
  })

  canvasTex(scene, 'tile_notice', S, S, (ctx) => {
    ctx.fillStyle = '#8b6f47'
    ctx.fillRect(4, 3, S - 8, S - 7)
    ctx.fillStyle = '#f7e6b5'
    ctx.fillRect(7, 6, 7, 8)
    ctx.fillRect(17, 7, 8, 6)
    ctx.fillStyle = '#c85d5d'
    ctx.fillRect(9, 8, 3, 1)
    ctx.fillStyle = '#496d9c'
    ctx.fillRect(19, 9, 4, 1)
    ctx.fillStyle = '#f3c969'
    ctx.fillRect(10, 17, 12, 5)
  })

  // ─── STAGE — raised wood planking with subtle stage-lighting glow ──
  canvasTex(scene, 'tile_stage', S, S, (ctx) => {
    // Warm wood floor with darker grain
    ctx.fillStyle = '#5b3a22'
    ctx.fillRect(0, 0, S, S)
    for (let py = 0; py < S; py += 8) {
      ctx.fillStyle = '#704728'
      ctx.fillRect(0, py, S, 7)
      ctx.fillStyle = '#3e2516'
      ctx.fillRect(0, py + 7, S, 1)
    }
    // Soft golden spotlight wash
    ctx.globalAlpha = 0.18
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(4, 4, S - 8, S - 8)
    ctx.globalAlpha = 1
    // Front-edge highlight so the stage edge reads
    ctx.fillStyle = '#fbbf24'
    ctx.fillRect(0, S - 1, S, 1)
  })

  // ─── PODIUM — mic stand on stage (transparent so stage floor shows through) ──
  canvasTex(scene, 'tile_podium', S, S, (ctx) => {
    ctx.clearRect(0, 0, S, S)
    // Podium base
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(11, 14, 10, 14)
    ctx.fillStyle = '#374151'
    ctx.fillRect(11, 14, 10, 3)
    // Mic stand
    ctx.fillStyle = '#9ca3af'
    ctx.fillRect(15, 4, 2, 12)
    // Mic head
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(13, 2, 6, 4)
    ctx.fillStyle = '#4b5563'
    ctx.fillRect(13, 2, 6, 1)
    // Subtle drop shadow under base
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#000000'
    ctx.fillRect(10, 28, 12, 2)
    ctx.globalAlpha = 1
  })

  // ─── BOARDROOM TABLE — table segment, transparent edges ──
  canvasTex(scene, 'tile_boardroom_table', S, S, (ctx) => {
    ctx.clearRect(0, 0, S, S)
    // Polished dark wood
    ctx.fillStyle = '#3d2817'
    ctx.fillRect(0, 4, S, S - 8)
    // Top sheen
    ctx.fillStyle = '#5b3a22'
    ctx.fillRect(0, 4, S, 3)
    // Edge highlight
    ctx.fillStyle = '#7c5535'
    ctx.fillRect(0, 4, S, 1)
    // Bottom shadow
    ctx.fillStyle = '#1a0f08'
    ctx.fillRect(0, S - 5, S, 1)
    // Subtle reflection on the surface
    ctx.globalAlpha = 0.12
    ctx.fillStyle = '#fbbf24'
    ctx.fillRect(2, 8, S - 4, 2)
    ctx.globalAlpha = 1
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOOR / OBJECT LOOKUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Maps floor tile type → texture key */
export function getFloorTextureKey(floorType: number): string {
  switch (floorType) {
    case T.MEETING:  return 'tile_meeting'
    case T.LOUNGE:   return 'tile_lounge'
    case T.CARPET:   return 'tile_carpet'
    case T.RUG:      return 'tile_rug'
    case T.WALL:     return 'tile_wall'
    case T.STAGE:    return 'tile_stage'
    default:         return 'tile_floor'
  }
}

/** Maps tile type → sprite key (for PNGs) or procedural key, or null if floor-only */
export function getObjectTextureKey(tileType: number): string | null {
  switch (tileType) {
    case T.WALL:       return 'tile_wall'
    case T.DESK_H:     return 'sprite_desk_h'
    case T.DESK_V:     return 'sprite_desk_v'
    case T.CHAIR:      return 'sprite_chair'
    case T.PLANT:      return 'sprite_plant'
    case T.BOOKSHELF:  return 'sprite_bookshelf'
    case T.COFFEE:     return 'sprite_coffee'
    case T.SOFA:       return 'tile_sofa'
    case T.WHITEBOARD: return 'tile_whiteboard'
    case T.GLASS_WALL: return 'tile_glass'
    case T.LOGO_SIGN:  return 'sprite_logo'
    case T.DOOR:       return 'tile_door'
    case T.CUBICLE:    return 'tile_cubicle'
    case T.OFFICE_DESK:return 'tile_office_desk'
    case T.NOTICE:     return 'tile_notice'
    case T.PODIUM:     return 'tile_podium'
    case T.BOARDROOM_TABLE: return 'tile_boardroom_table'
    default:           return null
  }
}

/** Whether a tile type uses a loaded PNG sprite (vs procedural or floor) */
export function isSpriteAsset(tileType: number): boolean {
  switch (tileType) {
    case T.DESK_H:
    case T.DESK_V:
    case T.CHAIR:
    case T.PLANT:
    case T.BOOKSHELF:
    case T.COFFEE:
    case T.LOGO_SIGN:
      return true
    default:
      return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHARACTER SPRITE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

export function generateCharacterTexture(
  scene: Phaser.Scene,
  key: string,
  shirtColor: string,
  skinColor: string,
  hairColor?: string,
  hairStyle?: number,
  bodyType?: BodyType,
  options: {
    bodyFrame?: AvatarBodyFrame | null
    outfitType?: AvatarOutfitType | null
    outfitColor?: string | null
    outfitAccentColor?: string | null
    headCoveringType?: AvatarHeadCoveringType | null
    headCoveringColor?: string | null
    accessories?: AvatarAccessory[] | null
  } = {},
) {
  const W = 20
  const H = 28
  const SCALE = 2
  const SW = W * SCALE
  const SH = H * SCALE

  const canvas = document.createElement('canvas')
  canvas.width = SW * 3
  canvas.height = SH * 4
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  const directions = ['down', 'left', 'right', 'up'] as const
  const hColor = hairColor || darken(shirtColor, 40)
  const hStyle = hairStyle ?? 0
  const bodyFrame = options.bodyFrame ?? (bodyType === 'female' ? 'feminine' : 'masculine')
  const body = bodyFrame === 'feminine' ? 'female' : 'male'
  const outfitType = options.outfitType ?? 'shirt'
  const outfitColor = options.outfitColor ?? shirtColor
  const accentColor = options.outfitAccentColor ?? '#2778f6'
  const headCoveringType = options.headCoveringType ?? 'none'
  const headCoveringColor = options.headCoveringColor ?? '#334155'
  const accessories = new Set(options.accessories ?? [])
  const shoeColor = '#383838'
  const pantsColor = '#484858'
  const beltColor = '#3a3a3a'

  directions.forEach((dir, row) => {
    for (let frame = 0; frame < 3; frame++) {
      const ox = frame * SW
      const oy = row * SH
      const p = (x: number, y: number, w: number, h: number, color: string) => {
        ctx.fillStyle = color
        ctx.fillRect(ox + x * SCALE, oy + y * SCALE, w * SCALE, h * SCALE)
      }

      const bob = frame === 1 ? -1 : frame === 2 ? 1 : 0

      // ── Hair ──────────────────────────────────────────
      if (headCoveringType === 'hijab') drawHijab(p, dir, headCoveringColor)
      else drawHair(p, dir, hStyle, hColor)

      // ── Head ──────────────────────────────────────────
      p(7, 4, 6, 5, skinColor)
      // Ear bumps on side views
      if (dir === 'left') p(6, 5, 1, 3, skinColor)
      if (dir === 'right') p(13, 5, 1, 3, skinColor)

      // ── Eyebrows ──────────────────────────────────────
      if (dir === 'down') {
        p(7, 5, 2, 1, darken(hColor, 10))
        p(11, 5, 2, 1, darken(hColor, 10))
      } else if (dir === 'left') {
        p(7, 5, 2, 1, darken(hColor, 10))
      } else if (dir === 'right') {
        p(11, 5, 2, 1, darken(hColor, 10))
      }

      // ── Eyes ──────────────────────────────────────────
      if (dir === 'down') {
        p(8, 6, 2, 2, '#282828')
        p(11, 6, 2, 2, '#282828')
        p(8, 6, 1, 1, '#ffffff')
        p(12, 6, 1, 1, '#ffffff')
      } else if (dir === 'left') {
        p(7, 6, 2, 2, '#282828')
        p(7, 6, 1, 1, '#ffffff')
      } else if (dir === 'right') {
        p(11, 6, 2, 2, '#282828')
        p(12, 6, 1, 1, '#ffffff')
      } else {
        // Back view: extra hair or head covering volume.
        p(7, 3, 6, 2, headCoveringType === 'hijab' ? headCoveringColor : hColor)
      }
      if (accessories.has('glasses')) drawGlasses(p, dir)

      // ── Neck ──────────────────────────────────────────
      p(9, 9, 2, 1, skinColor)

      // ── Body / Shirt ──────────────────────────────────
      const bodyW = body === 'female' ? 8 : 10
      const bodyX = body === 'female' ? 6 : 5
      drawOutfit(p, dir, bodyX, bodyW, body, outfitType, outfitColor, accentColor)
      // ── Arms ──────────────────────────────────────────
      const armY = 11 + bob
      if (dir === 'left') {
        p(4, armY, 2, 5, skinColor)
        p(bodyX + bodyW, 11, 1, 5, darken(outfitColor, 5))
      } else if (dir === 'right') {
        p(bodyX + bodyW, armY, 2, 5, skinColor)
        p(bodyX - 1, 11, 1, 5, darken(outfitColor, 5))
      } else {
        p(bodyX - 2, 11, 2, 5, skinColor)
        p(bodyX + bodyW, 11, 2, 5, skinColor)
      }

      // ── Belt ──────────────────────────────────────────
      p(bodyX, 17, bodyW, 1, beltColor)
      drawAccessories(p, dir, accessories, bodyX, bodyW, accentColor)

      // ── Pants ─────────────────────────────────────────
      const pantsX = body === 'female' ? 6 : 5
      const pantsW = body === 'female' ? 8 : 10
      p(pantsX, 18, pantsW, 4, pantsColor)
      // Center seam
      p(9, 18, 2, 4, darken(pantsColor, 5))

      // ── Legs / Shoes ──────────────────────────────────
      if (frame === 0) {
        p(pantsX + 1, 22, 3, 2, pantsColor)
        p(pantsX + pantsW - 4, 22, 3, 2, pantsColor)
        p(pantsX + 1, 24, 3, 2, shoeColor)
        p(pantsX + pantsW - 4, 24, 3, 2, shoeColor)
        // Shoe highlight
        p(pantsX + 1, 24, 3, 1, lighten(shoeColor, 15))
        p(pantsX + pantsW - 4, 24, 3, 1, lighten(shoeColor, 15))
      } else if (frame === 1) {
        p(pantsX, 22, 3, 2, pantsColor)
        p(pantsX + pantsW - 3, 21, 3, 2, pantsColor)
        p(pantsX, 24, 3, 2, shoeColor)
        p(pantsX + pantsW - 3, 23, 3, 2, shoeColor)
        p(pantsX, 24, 3, 1, lighten(shoeColor, 15))
        p(pantsX + pantsW - 3, 23, 3, 1, lighten(shoeColor, 15))
      } else {
        p(pantsX + 1, 21, 3, 2, pantsColor)
        p(pantsX + pantsW - 4, 22, 3, 2, pantsColor)
        p(pantsX + 1, 23, 3, 2, shoeColor)
        p(pantsX + pantsW - 4, 24, 3, 2, shoeColor)
        p(pantsX + 1, 23, 3, 1, lighten(shoeColor, 15))
        p(pantsX + pantsW - 4, 24, 3, 1, lighten(shoeColor, 15))
      }
    }
  })

  const texture = scene.textures.addCanvas(key, canvas)
  if (texture) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        texture.add(row * 3 + col, 0, col * SW, row * SH, SW, SH)
      }
    }
  }
}

// ─── Hair style drawing ─────────────────────────────────────────────────────

type PixelFn = (x: number, y: number, w: number, h: number, color: string) => void

function drawHijab(
  p: PixelFn,
  dir: 'down' | 'left' | 'right' | 'up',
  color: string,
) {
  const hi = lighten(color, 14)
  const lo = darken(color, 14)
  p(6, 1, 8, 4, color)
  p(6, 4, 1, 6, color)
  p(13, 4, 1, 6, color)
  p(7, 0, 6, 1, hi)
  if (dir === 'left') {
    p(5, 2, 2, 8, color)
    p(12, 3, 2, 7, lo)
  } else if (dir === 'right') {
    p(13, 2, 2, 8, color)
    p(6, 3, 2, 7, lo)
  } else if (dir === 'up') {
    p(6, 1, 8, 8, color)
    p(8, 2, 4, 1, hi)
  } else {
    p(6, 3, 1, 5, lo)
    p(13, 3, 1, 5, lo)
  }
}

function drawGlasses(p: PixelFn, dir: 'down' | 'left' | 'right' | 'up') {
  if (dir === 'down') {
    p(7, 6, 3, 1, '#1f2937')
    p(11, 6, 3, 1, '#1f2937')
    p(10, 6, 1, 1, '#1f2937')
  } else if (dir === 'left') {
    p(7, 6, 3, 1, '#1f2937')
  } else if (dir === 'right') {
    p(10, 6, 3, 1, '#1f2937')
  }
}

function drawOutfit(
  p: PixelFn,
  dir: 'down' | 'left' | 'right' | 'up',
  bodyX: number,
  bodyW: number,
  body: 'male' | 'female',
  outfitType: AvatarOutfitType,
  outfitColor: string,
  accentColor: string,
) {
  const shadow = darken(outfitColor, 18)
  p(bodyX, 10, bodyW, 7, outfitColor)
  p(bodyX, 15, bodyW, 2, shadow)

  if (outfitType === 'blazer' || outfitType === 'suit') {
    p(bodyX, 10, 2, 7, darken(outfitColor, 10))
    p(bodyX + bodyW - 2, 10, 2, 7, darken(outfitColor, 10))
    if (dir === 'down') {
      p(bodyX + 3, 10, bodyW - 6, 7, '#f8fafc')
      p(9, 11, 2, 5, accentColor)
    }
  } else if (outfitType === 'hoodie') {
    p(bodyX + 1, 9, bodyW - 2, 2, darken(outfitColor, 8))
    if (dir === 'down') {
      p(8, 12, 1, 3, accentColor)
      p(11, 12, 1, 3, accentColor)
    }
  } else if (outfitType === 'kurta') {
    p(bodyX - 1, 14, bodyW + 2, 5, outfitColor)
    if (dir === 'down') {
      p(9, 10, 2, 8, accentColor)
      p(7, 13, 6, 1, lighten(outfitColor, 8))
    }
  } else if (dir === 'down') {
    p(8, 10, 4, 1, darken(outfitColor, 10))
    p(9, 10, 2, 1, lighten(outfitColor, 8))
  }

  if (dir === 'down' && body === 'male' && outfitType === 'shirt') {
    p(11, 12, 2, 2, darken(outfitColor, 8))
  }
  if (dir === 'left') p(bodyX + bodyW - 1, 10, 1, 7, darken(outfitColor, 12))
  if (dir === 'right') p(bodyX, 10, 1, 7, darken(outfitColor, 12))
}

function drawAccessories(
  p: PixelFn,
  dir: 'down' | 'left' | 'right' | 'up',
  accessories: Set<AvatarAccessory>,
  bodyX: number,
  bodyW: number,
  accentColor: string,
) {
  if (accessories.has('badge') && dir === 'down') {
    p(bodyX + bodyW - 3, 12, 2, 2, '#f8fafc')
    p(bodyX + bodyW - 2, 13, 1, 1, accentColor)
  }
  if (accessories.has('watch')) {
    p(dir === 'right' ? bodyX + bodyW + 1 : bodyX - 2, 15, 1, 1, accentColor)
  }
}

function drawHair(
  p: PixelFn,
  dir: 'down' | 'left' | 'right' | 'up',
  style: number,
  color: string,
) {
  const hi = lighten(color, 15)
  const lo = darken(color, 10)

  switch (style) {
    case 0: // Short flat
      p(7, 1, 6, 3, color)
      p(8, 0, 4, 1, color)
      p(7, 1, 6, 1, hi)
      if (dir === 'left') p(6, 2, 1, 2, color)
      if (dir === 'right') p(13, 2, 1, 2, color)
      if (dir === 'up') { p(7, 1, 6, 4, color); p(8, 0, 4, 1, color) }
      break
    case 1: // Spiky
      p(7, 2, 6, 2, color)
      p(8, 0, 1, 2, color)
      p(10, -1, 1, 3, color)
      p(12, 0, 1, 2, color)
      p(7, 2, 6, 1, hi)
      if (dir === 'up') { p(7, 1, 6, 4, color); p(8, 0, 1, 1, color); p(10, -1, 1, 1, color); p(12, 0, 1, 1, color) }
      break
    case 2: // Side-part
      p(6, 1, 7, 3, color)
      p(6, 0, 5, 1, color)
      p(6, 1, 2, 1, hi)
      if (dir === 'left') { p(5, 2, 1, 3, color); p(6, 1, 1, 3, color) }
      if (dir === 'right') p(13, 2, 1, 2, color)
      if (dir === 'up') { p(6, 1, 7, 4, color); p(6, 0, 5, 1, color) }
      break
    case 3: // Long
      p(6, 1, 8, 3, color)
      p(7, 0, 6, 1, color)
      p(7, 0, 4, 1, hi)
      // Side hair hangs down
      if (dir === 'down' || dir === 'up') {
        p(6, 4, 1, 6, color)
        p(13, 4, 1, 6, color)
      }
      if (dir === 'left') { p(5, 2, 2, 8, color); p(5, 2, 1, 1, hi) }
      if (dir === 'right') { p(13, 2, 2, 8, color); p(14, 2, 1, 1, hi) }
      if (dir === 'up') { p(6, 1, 8, 5, color); p(7, 0, 6, 1, color); p(6, 4, 1, 6, color); p(13, 4, 1, 6, color) }
      break
    case 4: // Curly/poofy
      p(6, 0, 8, 4, color)
      p(5, 1, 1, 3, color)
      p(14, 1, 1, 3, color)
      p(7, 0, 6, 1, hi)
      // Texture dots for curly look
      p(7, 1, 1, 1, hi)
      p(11, 2, 1, 1, hi)
      p(9, 0, 1, 1, lo)
      p(13, 1, 1, 1, lo)
      if (dir === 'up') { p(6, 0, 8, 5, color); p(5, 1, 1, 4, color); p(14, 1, 1, 4, color) }
      break
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AMBIENT LIGHT TEXTURE
// ═══════════════════════════════════════════════════════════════════════════════

export function generateAmbientTexture(scene: Phaser.Scene, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Warm ambient gradient
  const grad = ctx.createRadialGradient(
    width / 2, height / 2, 100,
    width / 2, height / 2, Math.max(width, height) * 0.6,
  )
  grad.addColorStop(0, 'rgba(249, 226, 175, 0.08)')
  grad.addColorStop(0.5, 'rgba(249, 226, 175, 0.15)')
  grad.addColorStop(1, 'rgba(24, 20, 28, 0.30)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)

  scene.textures.addCanvas('ambient_light', canvas)
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIGNETTE TEXTURE
// ═══════════════════════════════════════════════════════════════════════════════

export function generateVignetteTexture(scene: Phaser.Scene, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.3,
    width / 2, height / 2, Math.max(width, height) * 0.7,
  )
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
  grad.addColorStop(1, 'rgba(24, 20, 28, 0.35)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)

  scene.textures.addCanvas('vignette', canvas)
}

// ═══════════════════════════════════════════════════════════════════════════════
// MONITOR GLOW TEXTURE
// ═══════════════════════════════════════════════════════════════════════════════

export function generateMonitorGlowTexture(scene: Phaser.Scene) {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(137, 196, 250, 0.6)')
  grad.addColorStop(0.5, 'rgba(137, 196, 250, 0.2)')
  grad.addColorStop(1, 'rgba(137, 196, 250, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)

  scene.textures.addCanvas('monitor_glow', canvas)
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHADOW TEXTURE (character shadow)
// ═══════════════════════════════════════════════════════════════════════════════

export function generateShadowTexture(scene: Phaser.Scene) {
  const canvas = document.createElement('canvas')
  canvas.width = 36
  canvas.height = 12
  const ctx = canvas.getContext('2d')!

  // Dithered elliptical shadow
  const img = ctx.createImageData(36, 12)
  const d = img.data
  const cx = 18, cy = 6, rx = 16, ry = 5
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 36; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry
      const dist = dx * dx + dy * dy
      if (dist < 1) {
        const alpha = (1 - dist) * 0.35
        if (orderedDither(x, y, alpha * 2)) {
          const i = (y * 36 + x) * 4
          d[i] = 24; d[i + 1] = 20; d[i + 2] = 28; d[i + 3] = Math.round(alpha * 255)
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  scene.textures.addCanvas('shadow', canvas)
}
