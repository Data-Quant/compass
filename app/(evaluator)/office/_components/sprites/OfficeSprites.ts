import * as Phaser from 'phaser'
import { TILE_SIZE, T, PALETTE } from '@/lib/office-config'

// ─── Helpers ────────────────────────────────────────────────────────────────

function hex(color: string): number {
  return Phaser.Display.Color.HexStringToColor(color).color
}

function drawPixel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: string, alpha = 1) {
  g.fillStyle(hex(color), alpha)
  g.fillRect(x, y, w, h)
}

// ─── Generate all tile textures ─────────────────────────────────────────────

export function generateTileTextures(scene: Phaser.Scene) {
  const S = TILE_SIZE

  // ── Floor (wood planks) ───────────────────────────────────────
  generateTexture(scene, 'tile_floor', S, S, (g) => {
    g.fillStyle(hex(PALETTE.floorWood1))
    g.fillRect(0, 0, S, S)
    // Plank lines
    g.fillStyle(hex(PALETTE.floorWood2), 0.4)
    g.fillRect(0, 7, S, 1)
    g.fillRect(0, 15, S, 1)
    g.fillRect(0, 23, S, 1)
    // Subtle grain
    g.fillStyle(hex(PALETTE.floorWood3), 0.15)
    g.fillRect(4, 2, 2, 1); g.fillRect(20, 10, 3, 1); g.fillRect(12, 18, 2, 1)
    g.fillRect(28, 5, 2, 1); g.fillRect(8, 26, 3, 1)
  })

  // ── Carpet floor ──────────────────────────────────────────────
  generateTexture(scene, 'tile_carpet', S, S, (g) => {
    g.fillStyle(hex(PALETTE.floorCarpet1))
    g.fillRect(0, 0, S, S)
    // Carpet texture dots
    g.fillStyle(hex(PALETTE.floorCarpet2), 0.3)
    for (let i = 0; i < 12; i++) {
      const px = (i * 7 + 3) % S
      const py = (i * 11 + 5) % S
      g.fillRect(px, py, 1, 1)
    }
  })

  // ── Meeting room floor ────────────────────────────────────────
  generateTexture(scene, 'tile_meeting', S, S, (g) => {
    g.fillStyle(hex(PALETTE.meetingFloor))
    g.fillRect(0, 0, S, S)
    g.fillStyle(hex('#938880'), 0.2)
    g.fillRect(0, 0, S, 1)
    g.fillRect(0, 0, 1, S)
  })

  // ── Lounge floor ──────────────────────────────────────────────
  generateTexture(scene, 'tile_lounge', S, S, (g) => {
    g.fillStyle(hex(PALETTE.loungeFloor))
    g.fillRect(0, 0, S, S)
    g.fillStyle(hex('#a89888'), 0.15)
    g.fillRect(0, 15, S, 1)
  })

  // ── Wall (3D depth effect) ────────────────────────────────────
  generateTexture(scene, 'tile_wall', S, S, (g) => {
    // Top face (dark)
    g.fillStyle(hex(PALETTE.wallTop))
    g.fillRect(0, 0, S, 10)
    // Front face (lighter)
    g.fillStyle(hex(PALETTE.wallFace))
    g.fillRect(0, 10, S, S - 10)
    // Edge highlight
    g.fillStyle(hex('#786e64'), 0.5)
    g.fillRect(0, 10, S, 1)
    // Shadow at bottom
    g.fillStyle(hex(PALETTE.wallDark), 0.4)
    g.fillRect(0, S - 2, S, 2)
  })

  // ── Glass wall ────────────────────────────────────────────────
  generateTexture(scene, 'tile_glass', S, S, (g) => {
    g.fillStyle(hex(PALETTE.floorWood1))
    g.fillRect(0, 0, S, S)
    // Glass pane
    g.fillStyle(hex('#89b4fa'), 0.15)
    g.fillRect(2, 0, S - 4, S)
    // Frame
    g.fillStyle(hex('#888888'), 0.6)
    g.fillRect(1, 0, 1, S)
    g.fillRect(S - 2, 0, 1, S)
    // Reflection
    g.fillStyle(hex('#ffffff'), 0.1)
    g.fillRect(6, 2, 2, S - 4)
  })

  // ── Desk (horizontal, with monitor) ───────────────────────────
  generateTexture(scene, 'tile_desk_h', S, S, (g) => {
    // Floor underneath
    g.fillStyle(hex(PALETTE.floorWood1))
    g.fillRect(0, 0, S, S)
    // Desk surface
    g.fillStyle(hex(PALETTE.deskTop))
    g.fillRect(1, 4, S - 2, S - 8)
    // Desk edge (depth)
    g.fillStyle(hex(PALETTE.deskLeg))
    g.fillRect(1, S - 5, S - 2, 2)
    // Monitor
    g.fillStyle(hex(PALETTE.monitorFrame))
    g.fillRect(10, 6, 12, 10)
    // Screen
    g.fillStyle(hex(PALETTE.monitorScreen))
    g.fillRect(11, 7, 10, 7)
    // Monitor stand
    g.fillStyle(hex(PALETTE.monitorFrame))
    g.fillRect(14, 16, 4, 2)
    g.fillRect(12, 18, 8, 1)
    // Keyboard
    g.fillStyle(hex('#484848'))
    g.fillRect(9, 20, 14, 3)
    g.fillStyle(hex('#585858'))
    g.fillRect(10, 21, 12, 1)
  })

  // ── Desk vertical (small table) ───────────────────────────────
  generateTexture(scene, 'tile_desk_v', S, S, (g) => {
    g.fillStyle(hex(PALETTE.floorWood1))
    g.fillRect(0, 0, S, S)
    g.fillStyle(hex(PALETTE.deskTop))
    g.fillRect(6, 6, S - 12, S - 12)
    g.fillStyle(hex(PALETTE.deskLeg))
    g.fillRect(6, S - 8, S - 12, 2)
  })

  // ── Chair ─────────────────────────────────────────────────────
  generateTexture(scene, 'tile_chair', S, S, (g) => {
    g.fillStyle(hex(PALETTE.floorWood1))
    g.fillRect(0, 0, S, S)
    // Chair seat
    g.fillStyle(hex(PALETTE.chairSeat))
    g.fillRect(8, 10, 16, 14)
    // Chair back
    g.fillStyle(hex(PALETTE.chairBack))
    g.fillRect(10, 6, 12, 6)
    // Armrests
    g.fillStyle(hex('#505060'))
    g.fillRect(7, 12, 2, 8)
    g.fillRect(23, 12, 2, 8)
  })

  // ── Plant ─────────────────────────────────────────────────────
  generateTexture(scene, 'tile_plant', S, S, (g) => {
    g.fillStyle(hex(PALETTE.floorWood1))
    g.fillRect(0, 0, S, S)
    // Pot
    g.fillStyle(hex(PALETTE.plantPot))
    g.fillRect(10, 20, 12, 8)
    g.fillStyle(hex('#907058'))
    g.fillRect(11, 19, 10, 2)
    // Leaves (3 clusters)
    g.fillStyle(hex(PALETTE.plantGreen1))
    g.fillCircle(16, 14, 7)
    g.fillStyle(hex(PALETTE.plantGreen2))
    g.fillCircle(12, 12, 5)
    g.fillCircle(20, 11, 5)
    // Highlights
    g.fillStyle(hex('#80d88c'), 0.5)
    g.fillCircle(14, 10, 3)
  })

  // ── Sofa ──────────────────────────────────────────────────────
  generateTexture(scene, 'tile_sofa', S, S, (g) => {
    g.fillStyle(hex(PALETTE.loungeFloor))
    g.fillRect(0, 0, S, S)
    // Sofa body
    g.fillStyle(hex(PALETTE.sofaBody))
    g.fillRect(2, 8, S - 4, S - 12)
    // Cushion
    g.fillStyle(hex(PALETTE.sofaCushion))
    g.fillRect(4, 10, S - 8, S - 16)
    // Armrest shadows
    g.fillStyle(hex('#685898'), 0.4)
    g.fillRect(2, 8, 3, S - 12)
    g.fillRect(S - 5, 8, 3, S - 12)
    // Back
    g.fillStyle(hex('#685898'))
    g.fillRect(2, 6, S - 4, 4)
  })

  // ── Bookshelf ─────────────────────────────────────────────────
  generateTexture(scene, 'tile_bookshelf', S, S, (g) => {
    g.fillStyle(hex(PALETTE.floorWood1))
    g.fillRect(0, 0, S, S)
    // Shelf frame
    g.fillStyle(hex(PALETTE.bookshelf))
    g.fillRect(2, 0, S - 4, S)
    // Shelves
    g.fillStyle(hex('#906850'))
    g.fillRect(2, 10, S - 4, 2)
    g.fillRect(2, 20, S - 4, 2)
    // Books on shelves
    const colors = PALETTE.bookColors
    for (let shelf = 0; shelf < 3; shelf++) {
      const sy = shelf * 10 + 1
      let bx = 4
      for (let b = 0; b < 4; b++) {
        const w = 4 + (b % 2)
        g.fillStyle(hex(colors[(shelf * 4 + b) % colors.length]))
        g.fillRect(bx, sy, w, 8)
        bx += w + 1
      }
    }
  })

  // ── Coffee machine ────────────────────────────────────────────
  generateTexture(scene, 'tile_coffee', S, S, (g) => {
    g.fillStyle(hex(PALETTE.floorCarpet1))
    g.fillRect(0, 0, S, S)
    // Machine body
    g.fillStyle(hex(PALETTE.coffeeMachine))
    g.fillRect(6, 2, 20, 26)
    // Front panel
    g.fillStyle(hex('#686060'))
    g.fillRect(8, 4, 16, 10)
    // Display
    g.fillStyle(hex('#a6e3a1'))
    g.fillRect(10, 6, 12, 3)
    // Buttons
    g.fillStyle(hex('#f38ba8'))
    g.fillCircle(12, 18, 2)
    g.fillStyle(hex('#89b4fa'))
    g.fillCircle(20, 18, 2)
    // Drip tray
    g.fillStyle(hex('#484040'))
    g.fillRect(10, 22, 12, 4)
  })

  // ── Whiteboard ────────────────────────────────────────────────
  generateTexture(scene, 'tile_whiteboard', S, S, (g) => {
    g.fillStyle(hex(PALETTE.meetingFloor))
    g.fillRect(0, 0, S, S)
    // Frame
    g.fillStyle(hex(PALETTE.whiteboardFrame))
    g.fillRect(2, 2, S - 4, S - 8)
    // Board surface
    g.fillStyle(hex(PALETTE.whiteboardBg))
    g.fillRect(4, 4, S - 8, S - 12)
    // Scribbles
    g.fillStyle(hex('#4060c0'), 0.4)
    g.fillRect(6, 8, 14, 1); g.fillRect(6, 12, 10, 1)
    g.fillStyle(hex('#c04040'), 0.4)
    g.fillRect(6, 16, 16, 1); g.fillRect(6, 20, 8, 1)
  })

  // ── Rug ───────────────────────────────────────────────────────
  generateTexture(scene, 'tile_rug', S, S, (g) => {
    g.fillStyle(hex(PALETTE.rug1))
    g.fillRect(0, 0, S, S)
    // Border pattern
    g.fillStyle(hex(PALETTE.rug2), 0.6)
    g.fillRect(0, 0, S, 2); g.fillRect(0, S - 2, S, 2)
    g.fillRect(0, 0, 2, S); g.fillRect(S - 2, 0, 2, S)
    // Center diamond
    g.fillStyle(hex('#d8a880'), 0.3)
    g.fillRect(12, 12, 8, 8)
  })
}

// ─── Generate character sprite sheet ────────────────────────────────────────
// Creates a 4-direction * 3-frame sprite sheet (idle + 2 walk frames)
// Layout: 12 frames total, 4 rows (down, left, right, up) x 3 cols (idle, walk1, walk2)

export function generateCharacterTexture(
  scene: Phaser.Scene,
  key: string,
  shirtColor: string,
  skinColor: string,
) {
  const W = 16  // character pixel width
  const H = 22  // character pixel height
  const SCALE = 2  // scale up for crispness
  const SW = W * SCALE
  const SH = H * SCALE

  const canvas = document.createElement('canvas')
  canvas.width = SW * 3  // 3 frames
  canvas.height = SH * 4 // 4 directions
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  const directions = ['down', 'left', 'right', 'up']
  const hairColor = darken(shirtColor, 40)
  const shoeColor = '#383838'
  const pantsColor = '#484858'

  directions.forEach((dir, row) => {
    for (let frame = 0; frame < 3; frame++) {
      const ox = frame * SW
      const oy = row * SH
      const p = (x: number, y: number, w: number, h: number, color: string) => {
        ctx.fillStyle = color
        ctx.fillRect(ox + x * SCALE, oy + y * SCALE, w * SCALE, h * SCALE)
      }

      // Walk bob offset
      const bob = frame === 1 ? -1 : frame === 2 ? 1 : 0

      // ── Hair (top of head) ────────────────────────────
      p(5, 1, 6, 3, hairColor)

      // ── Head ──────────────────────────────────────────
      p(5, 3, 6, 5, skinColor)

      // ── Eyes ──────────────────────────────────────────
      if (dir === 'down') {
        p(6, 5, 2, 2, '#282828'); p(10, 5, 2, 2, '#282828') // eyes
        p(7, 5, 1, 1, '#ffffff'); p(11, 5, 1, 1, '#ffffff')  // highlights
      } else if (dir === 'up') {
        // No eyes visible from back
        p(5, 2, 6, 2, hairColor) // extra hair
      } else if (dir === 'left') {
        p(5, 5, 2, 2, '#282828')
        p(5, 5, 1, 1, '#ffffff')
      } else {
        p(10, 5, 2, 2, '#282828')
        p(11, 5, 1, 1, '#ffffff')
      }

      // ── Body / Shirt ──────────────────────────────────
      p(4, 8, 8, 7, shirtColor)
      // Shirt shadow
      p(4, 13, 8, 2, darken(shirtColor, 20))

      // ── Arms ──────────────────────────────────────────
      if (dir === 'left') {
        p(3, 9 + bob, 2, 5, skinColor)
      } else if (dir === 'right') {
        p(11, 9 + bob, 2, 5, skinColor)
      } else {
        p(3, 9, 2, 5, skinColor)
        p(11, 9, 2, 5, skinColor)
      }

      // ── Pants ─────────────────────────────────────────
      p(4, 15, 8, 3, pantsColor)

      // ── Legs / Shoes (with walk animation) ────────────
      if (frame === 0) {
        // Idle: both feet together
        p(5, 18, 3, 2, shoeColor)
        p(9, 18, 3, 2, shoeColor)
      } else if (frame === 1) {
        // Walk frame 1: left foot forward
        p(4, 18, 3, 2, shoeColor)
        p(10, 17, 3, 2, shoeColor)
      } else {
        // Walk frame 2: right foot forward
        p(5, 17, 3, 2, shoeColor)
        p(10, 18, 3, 2, shoeColor)
      }
    }
  })

  const texture = scene.textures.addCanvas(key, canvas)
  // Add individual frames: 4 rows (directions) × 3 cols (idle, walk1, walk2)
  if (texture) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        texture.add(row * 3 + col, 0, col * SW, row * SH, SW, SH)
      }
    }
  }
}

// ─── Ambient light overlay texture ──────────────────────────────────────────

export function generateAmbientTexture(scene: Phaser.Scene, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Warm ambient gradient overlay
  const grad = ctx.createRadialGradient(width / 2, height / 2, 100, width / 2, height / 2, Math.max(width, height) * 0.6)
  grad.addColorStop(0, 'rgba(249, 226, 175, 0.03)')
  grad.addColorStop(0.5, 'rgba(249, 226, 175, 0.06)')
  grad.addColorStop(1, 'rgba(24, 20, 28, 0.12)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)

  scene.textures.addCanvas('ambient_light', canvas)
}

// ─── Shadow texture for characters ──────────────────────────────────────────

export function generateShadowTexture(scene: Phaser.Scene) {
  const canvas = document.createElement('canvas')
  canvas.width = 28
  canvas.height = 10
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(24, 20, 28, 0.3)'
  ctx.beginPath()
  ctx.ellipse(14, 5, 12, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  scene.textures.addCanvas('shadow', canvas)
}

// ─── Helper: generate a texture from a Graphics draw callback ───────────────

function generateTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void
) {
  const g = scene.add.graphics()
  draw(g)
  g.generateTexture(key, width, height)
  g.destroy()
}

// ─── Helper: darken a hex color ─────────────────────────────────────────────

function darken(hexColor: string, amount: number): string {
  const c = Phaser.Display.Color.HexStringToColor(hexColor)
  return Phaser.Display.Color.RGBToString(
    Math.max(0, c.red - amount),
    Math.max(0, c.green - amount),
    Math.max(0, c.blue - amount),
  )
}

// ─── Map: tile key lookup ───────────────────────────────────────────────────

export function getTileTextureKey(tileType: number): string {
  switch (tileType) {
    case T.WALL:        return 'tile_wall'
    case T.DESK_H:      return 'tile_desk_h'
    case T.DESK_V:      return 'tile_desk_v'
    case T.MEETING:     return 'tile_meeting'
    case T.LOUNGE:      return 'tile_lounge'
    case T.PLANT:       return 'tile_plant'
    case T.CHAIR:       return 'tile_chair'
    case T.SOFA:        return 'tile_sofa'
    case T.BOOKSHELF:   return 'tile_bookshelf'
    case T.COFFEE:      return 'tile_coffee'
    case T.WHITEBOARD:  return 'tile_whiteboard'
    case T.RUG:         return 'tile_rug'
    case T.WALL_BOTTOM: return 'tile_wall'
    case T.CARPET:      return 'tile_carpet'
    case T.GLASS_WALL:  return 'tile_glass'
    default:            return 'tile_floor'
  }
}
