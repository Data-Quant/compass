export const OFFICE_TILE_SIZE = 32
export const OFFICE_MAP_WIDTH = 96
export const OFFICE_MAP_HEIGHT = 64
// Spawn drops players inside the lobby, just inside the south door.
export const OFFICE_SPAWN = { x: 50, y: 60 }

// Minimum gap (ms) between consecutive move messages from a single player.
// Enforced on the server and gated on the client from the same constant so
// the two never drift apart.
export const OFFICE_MOVE_RATE_LIMIT_MS = 100

export const OFFICE_TILE = {
  FLOOR: 0,
  WALL: 1,
  DESK_H: 2,
  DESK_V: 3,
  MEETING: 4,
  LOUNGE: 5,
  PLANT: 6,
  CHAIR: 7,
  SOFA: 8,
  BOOKSHELF: 9,
  COFFEE: 10,
  WHITEBOARD: 11,
  RUG: 12,
  WALL_BOTTOM: 13,
  CARPET: 14,
  GLASS_WALL: 15,
  LOGO_SIGN: 16,
  DOOR: 17,
  CUBICLE: 18,
  OFFICE_DESK: 19,
  NOTICE: 20,
  STAGE: 21,
  PODIUM: 22,
  BOARDROOM_TABLE: 23,
} as const

export type OfficeTileType = (typeof OFFICE_TILE)[keyof typeof OFFICE_TILE]
export type OfficeRoomType =
  | 'lobby'
  | 'department'
  | 'leadership'
  | 'meeting'
  | 'townhall'
  | 'focus'
  | 'lounge'
  | 'break'
  | 'support'

export type OfficeZoneDefinition = {
  id: string
  label: string
  type: OfficeRoomType
  x1: number
  y1: number
  x2: number
  y2: number
  audioMode: 'open' | 'room' | 'private' | 'broadcast'
  /** Department string this zone belongs to (matches User.department). */
  department?: string
}

export type OfficeCubicleDefinition = {
  id: string
  label: string
  /** Department string the cubicle is reserved for (matches User.department). */
  department: string
  x: number
  y: number
  seatX: number
  seatY: number
}

export type OfficeLeadershipOfficeDefinition = {
  id: string
  label: string
  /** If set, this lead office is reserved for the lead of this department. */
  department?: string
  x1: number
  y1: number
  x2: number
  y2: number
  deskX: number
  deskY: number
}

export type OfficeInteractableDefinition = {
  id: string
  label: string
  kind:
    | 'logo'
    | 'cubicle'
    | 'leadership-office'
    | 'meeting-room'
    | 'department-sign'
    | 'help-desk'
    | 'deep-link'
    | 'stage'
  x: number
  y: number
  href?: string
  zoneId?: string
}

export type OfficeBrandingDefinition = {
  companyName: string
  logoPath: string
  markPath: string
  primaryColor: string
}

export type OfficeWorldDefinition = {
  id: string
  name: string
  width: number
  height: number
  tileSize: number
  spawn: { x: number; y: number }
  branding: OfficeBrandingDefinition
  zones: OfficeZoneDefinition[]
  cubicles: OfficeCubicleDefinition[]
  leadershipOffices: OfficeLeadershipOfficeDefinition[]
  interactables: OfficeInteractableDefinition[]
  /** Stage tiles inside the town hall — standing here broadcasts to everyone in the zone. */
  stageTiles: { x: number; y: number; zoneId: string }[]
}

export type OfficeMapData = {
  tileMap: number[][]
  floorMap: number[][]
}

// ─── Decor catalog ──────────────────────────────────────────────────────────
// Players customize their cubicle/lead office via DecorChoices. Schema-side
// we store this in OfficeCubicleAssignment.decorJson (and the lead office
// equivalent). Render-side, OfficeScene reads it through the directory.

export const DECOR_THEMES = ['plutus-blue', 'deep-focus', 'warm-wood', 'clean-slate'] as const
export type DecorTheme = (typeof DECOR_THEMES)[number]

export const DECOR_DESK_ITEMS = ['plant', 'notebook', 'coffee', 'award'] as const
export type DecorDeskItem = (typeof DECOR_DESK_ITEMS)[number]

export const DECOR_WALL_ITEMS = ['plutus-poster', 'team-photo', 'whiteboard', 'market-chart'] as const
export type DecorWallItem = (typeof DECOR_WALL_ITEMS)[number]

export type DecorChoices = {
  theme: DecorTheme
  deskItems: DecorDeskItem[]
  wallItem: DecorWallItem | null
}

export const DEFAULT_DECOR: DecorChoices = {
  theme: 'plutus-blue',
  deskItems: [],
  wallItem: null,
}

/** Returns hex tint values for a theme — used to color the cubicle prop. */
export function decorThemeTint(theme: DecorTheme): { primary: string; accent: string } {
  switch (theme) {
    case 'plutus-blue': return { primary: '#2378f5', accent: '#1e3a8a' }
    case 'deep-focus':  return { primary: '#1f2937', accent: '#0f172a' }
    case 'warm-wood':   return { primary: '#8b5a2b', accent: '#5b3a22' }
    case 'clean-slate': return { primary: '#94a3b8', accent: '#475569' }
  }
}

// ─── Department wing layout ──────────────────────────────────────────────────
// Eight department wings sit in a 4×2 grid in the central band. Each wing is
// 20 wide × 18 tall, with the lead office tucked into the upper-right corner
// and a configurable number of nameplated cubicles in the open floor area.
// The exact User.department string for each wing is the canonical name HR
// provided. Cubicle slots default to 9 (3 cols × 3 rows); Technology has more
// people so it gets 12 (3 cols × 4 rows packed tighter).

type DeptWingPlan = {
  id: string
  label: string
  /** Must match User.department exactly. */
  department: string
  x1: number
  y1: number
  /** Optional override for the number of cubicles in this wing. Default 9. */
  cubicleSlots?: number
}

const DEFAULT_CUBICLE_SLOTS = 9
const MAX_CUBICLE_SLOTS = 12

// Each wing occupies a 20×18 block. Origin (x1, y1) is the top-left corner.
const DEPT_WINGS: DeptWingPlan[] = [
  // Top row — Technology has overflow capacity for Ammar's larger team.
  { id: 'quant',         label: 'Technology',               department: 'Technology',               x1: 2,  y1: 17, cubicleSlots: 12 },
  { id: 'valuecreation', label: 'Value Creation',           department: 'Value Creation',           x1: 25, y1: 17 },
  { id: 'growth',        label: 'Growth and Strategy',      department: 'Growth and Strategy',      x1: 52, y1: 17 },
  { id: 'ops',           label: 'Ops and Accounting',       department: 'Ops and Accounting',       x1: 75, y1: 17 },
  // Bottom row
  { id: 'hr',            label: 'HR',                       department: 'HR',                       x1: 2,  y1: 37 },
  { id: 'design',        label: 'Design',                   department: 'Design',                   x1: 25, y1: 37 },
  { id: 'oneonone',      label: '1to1 Plans',               department: '1to1 plans',               x1: 52, y1: 37 },
  { id: 'product',       label: 'Product',                  department: 'Product',                  x1: 75, y1: 37 },
]

const DEPT_WING_W = 20
const DEPT_WING_H = 18

// Lead office sits in the top-right of every wing, 7 wide × 7 tall.
const LEAD_OFFICE_W = 7
const LEAD_OFFICE_H = 7

// Cubicles are placed in the wing's open floor (left side, below the lead
// office). 3 columns at dx=3, 7, 11. Rows step down starting at dy=8 (one row
// south of the lead office's bottom wall) — 9-slot wings space rows 3 apart
// for breathing room; 12-slot wings pack 4 rows tighter (2 apart).
function buildCubicleLayout(slots: number): Array<{ dx: number; dy: number }> {
  const cols = [3, 7, 11]
  const rowCount = Math.ceil(slots / cols.length)
  const rowGap = rowCount <= 3 ? 3 : 2
  const positions: Array<{ dx: number; dy: number }> = []
  for (let row = 0; row < rowCount; row += 1) {
    const dy = 8 + row * rowGap
    for (const dx of cols) {
      if (positions.length >= slots) break
      positions.push({ dx, dy })
    }
  }
  return positions
}

function buildDeptZones(): OfficeZoneDefinition[] {
  return DEPT_WINGS.map((wing) => ({
    id: wing.id,
    label: wing.label,
    type: 'department' as const,
    x1: wing.x1,
    y1: wing.y1,
    x2: wing.x1 + DEPT_WING_W - 1,
    y2: wing.y1 + DEPT_WING_H - 1,
    audioMode: 'room' as const,
    department: wing.department,
  }))
}

function buildDeptCubicles(): OfficeCubicleDefinition[] {
  const cubicles: OfficeCubicleDefinition[] = []
  for (const wing of DEPT_WINGS) {
    const slots = Math.min(wing.cubicleSlots ?? DEFAULT_CUBICLE_SLOTS, MAX_CUBICLE_SLOTS)
    const layout = buildCubicleLayout(slots)
    layout.forEach((cell, index) => {
      const x = wing.x1 + cell.dx
      const y = wing.y1 + cell.dy
      cubicles.push({
        id: `${wing.id}-cubicle-${index + 1}`,
        label: `${wing.label} · Desk ${index + 1}`,
        department: wing.department,
        x,
        y,
        seatX: x,
        seatY: y + 1,
      })
    })
  }
  return cubicles
}

function buildDeptLeadOffices(): OfficeLeadershipOfficeDefinition[] {
  return DEPT_WINGS.map((wing) => {
    const x1 = wing.x1 + DEPT_WING_W - LEAD_OFFICE_W - 1
    const y1 = wing.y1 + 1
    return {
      id: `lead-${wing.id}`,
      label: `${wing.label} · Lead Office`,
      department: wing.department,
      x1,
      y1,
      x2: x1 + LEAD_OFFICE_W - 1,
      y2: y1 + LEAD_OFFICE_H - 1,
      // Desk sits at the top of the office (y1+1) so the south-wall door
      // gives the player a straight, unobstructed walk-up to the chair.
      deskX: x1 + 3,
      deskY: y1 + 1,
    }
  })
}

function buildDeptSigns(): OfficeInteractableDefinition[] {
  // Signs sit just outside the wing's south wall so they read as a doorplate.
  return DEPT_WINGS.map((wing) => ({
    id: `${wing.id}-sign`,
    label: wing.label,
    kind: 'department-sign' as const,
    x: wing.x1 + Math.floor(DEPT_WING_W / 2),
    y: wing.y1 + DEPT_WING_H, // one tile south of the wing's south wall
    zoneId: wing.id,
  }))
}

// Partner-and-up wing on the far north left.
const LEADERSHIP_WING = { x1: 2, y1: 2, x2: 15, y2: 14 }

const PARTNER_OFFICES: OfficeLeadershipOfficeDefinition[] = [
  { id: 'partner-office-1', label: 'Partner Office 1', x1: 3,  y1: 3, x2: 6,  y2: 7,  deskX: 4,  deskY: 4 },
  { id: 'partner-office-2', label: 'Partner Office 2', x1: 8,  y1: 3, x2: 11, y2: 7,  deskX: 9,  deskY: 4 },
  { id: 'partner-office-3', label: 'Partner Office 3', x1: 3,  y1: 9, x2: 6,  y2: 13, deskX: 4,  deskY: 10 },
  { id: 'partner-office-4', label: 'Partner Office 4', x1: 8,  y1: 9, x2: 11, y2: 13, deskX: 9,  deskY: 10 },
]

// ─── Town Hall stage ────────────────────────────────────────────────────────
// Stage runs across the front of the town hall. Standing on any of these tiles
// opts a speaker into broadcast mode (heard by everyone in the zone).
const TOWN_HALL_STAGE_TILES = [
  { x: 53, y: 3, zoneId: 'town-hall' },
  { x: 54, y: 3, zoneId: 'town-hall' },
  { x: 55, y: 3, zoneId: 'town-hall' },
  { x: 56, y: 3, zoneId: 'town-hall' },
  { x: 57, y: 3, zoneId: 'town-hall' },
  { x: 58, y: 3, zoneId: 'town-hall' },
  { x: 53, y: 4, zoneId: 'town-hall' },
  { x: 54, y: 4, zoneId: 'town-hall' },
  { x: 55, y: 4, zoneId: 'town-hall' },
  { x: 56, y: 4, zoneId: 'town-hall' },
  { x: 57, y: 4, zoneId: 'town-hall' },
  { x: 58, y: 4, zoneId: 'town-hall' },
]

export const OFFICE_WORLD: OfficeWorldDefinition = {
  id: 'plutus21-hq',
  name: 'Plutus21 HQ',
  width: OFFICE_MAP_WIDTH,
  height: OFFICE_MAP_HEIGHT,
  tileSize: OFFICE_TILE_SIZE,
  spawn: OFFICE_SPAWN,
  branding: {
    companyName: 'Plutus21',
    logoPath: '/icons/plutus21/plutus-light.svg',
    markPath: '/icons/plutus21/plutus-light-192.png',
    primaryColor: '#2377f5',
  },
  zones: [
    // North band
    { id: 'leadership',     label: 'Leadership Wing',  type: 'leadership', x1: LEADERSHIP_WING.x1, y1: LEADERSHIP_WING.y1, x2: LEADERSHIP_WING.x2, y2: LEADERSHIP_WING.y2, audioMode: 'private' },
    { id: 'boardroom-north',label: 'North Boardroom',  type: 'meeting',    x1: 18, y1: 2,  x2: 36, y2: 14, audioMode: 'room' },
    { id: 'town-hall',      label: 'Town Hall',        type: 'townhall',   x1: 39, y1: 2,  x2: 73, y2: 14, audioMode: 'room' },
    { id: 'boardroom-east', label: 'East Boardroom',   type: 'meeting',    x1: 76, y1: 2,  x2: 93, y2: 14, audioMode: 'room' },
    // Department wings — middle band
    ...buildDeptZones(),
    // South band
    { id: 'lobby',      label: 'Plutus21 Lobby', type: 'lobby',   x1: 46, y1: 57, x2: 58, y2: 62, audioMode: 'open' },
    { id: 'lounge',     label: 'Lounge',         type: 'lounge',  x1: 2,  y1: 57, x2: 23, y2: 62, audioMode: 'open' },
    { id: 'focus-pods', label: 'Focus Pods',     type: 'focus',   x1: 26, y1: 57, x2: 43, y2: 62, audioMode: 'private' },
    { id: 'break-room', label: 'Break Room',     type: 'break',   x1: 60, y1: 57, x2: 77, y2: 62, audioMode: 'open' },
    { id: 'help-desk',  label: 'People Ops Help Desk', type: 'support', x1: 80, y1: 57, x2: 93, y2: 62, audioMode: 'open' },
  ],
  cubicles: buildDeptCubicles(),
  leadershipOffices: [
    ...PARTNER_OFFICES,
    ...buildDeptLeadOffices(),
  ],
  interactables: [
    { id: 'main-logo', label: 'Plutus21', kind: 'logo', x: 49, y: 58, zoneId: 'lobby' },
    { id: 'org-chart', label: 'Org Chart', kind: 'deep-link', x: 84, y: 60, href: '/admin/org-chart', zoneId: 'help-desk' },
    { id: 'reports', label: 'Performance Reports', kind: 'deep-link', x: 87, y: 60, href: '/admin/reports', zoneId: 'help-desk' },
    { id: 'hr-help', label: 'HR Help Desk', kind: 'help-desk', x: 90, y: 60, href: '/device-tickets', zoneId: 'help-desk' },
    { id: 'town-hall-stage', label: 'Town Hall Stage', kind: 'stage', x: 55, y: 4, zoneId: 'town-hall' },
    ...buildDeptSigns(),
  ],
  stageTiles: TOWN_HALL_STAGE_TILES,
}

export function isOfficeTileWalkable(tile: number) {
  const blockedTiles: number[] = [
    OFFICE_TILE.WALL,
    OFFICE_TILE.DESK_H,
    OFFICE_TILE.DESK_V,
    OFFICE_TILE.BOOKSHELF,
    OFFICE_TILE.COFFEE,
    OFFICE_TILE.WHITEBOARD,
    OFFICE_TILE.GLASS_WALL,
    OFFICE_TILE.SOFA,
    // LOGO_SIGN is intentionally walkable — the Plutus21 mark renders as a
    // floor decal in the lobby, like a corporate rug.
    OFFICE_TILE.CUBICLE,
    OFFICE_TILE.OFFICE_DESK,
    OFFICE_TILE.NOTICE,
    OFFICE_TILE.PODIUM,
    OFFICE_TILE.BOARDROOM_TABLE,
    // STAGE is intentionally walkable — speakers stand on it.
  ]
  return !blockedTiles.includes(tile)
}

export function getOfficeZoneAt(x: number, y: number, world = OFFICE_WORLD) {
  return (
    world.zones.find((zone) => x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) ||
    null
  )
}

export function isOnStage(x: number, y: number, world = OFFICE_WORLD) {
  return world.stageTiles.some((tile) => tile.x === x && tile.y === y)
}

// ─── Map generation ─────────────────────────────────────────────────────────
//
// generateOfficeMap walks the world definition and stamps walls, floors,
// doors, and props into a 2D grid. Walls are explicit so movement collision
// reads cleanly to the player ("I cannot pass through this row of tiles").

export function generateOfficeMap(world = OFFICE_WORLD): OfficeMapData {
  const T = OFFICE_TILE
  const tileMap = Array.from({ length: world.height }, () => new Array(world.width).fill(T.FLOOR))
  const floorMap = Array.from({ length: world.height }, () => new Array(world.width).fill(T.FLOOR))

  const setWall = (x: number, y: number) => {
    if (y < 0 || y >= world.height || x < 0 || x >= world.width) return
    tileMap[y][x] = T.WALL
    floorMap[y][x] = T.WALL
  }
  const setFloor = (x: number, y: number, tile: number) => {
    if (y < 0 || y >= world.height || x < 0 || x >= world.width) return
    tileMap[y][x] = tile
    floorMap[y][x] = tile
  }
  const setObj = (x: number, y: number, tile: number) => {
    if (y < 0 || y >= world.height || x < 0 || x >= world.width) return
    tileMap[y][x] = tile
  }

  // World perimeter
  for (let x = 0; x < world.width; x += 1) {
    setWall(x, 0)
    setWall(x, 1)
    setWall(x, world.height - 1)
  }
  for (let y = 0; y < world.height; y += 1) {
    setWall(0, y)
    setWall(world.width - 1, y)
  }

  // Zone floors — picks a tile per room type so the player can read the
  // boundaries at a glance.
  for (const zone of world.zones) {
    const floorTile =
      zone.type === 'meeting'
        ? T.MEETING
        : zone.type === 'townhall'
          ? T.MEETING
          : zone.type === 'lounge'
            ? T.LOUNGE
            : zone.type === 'break'
              ? T.LOUNGE
              : zone.type === 'focus'
                ? T.CARPET
                : zone.type === 'lobby'
                  ? T.RUG
                  : zone.type === 'leadership'
                    ? T.CARPET
                    : zone.type === 'support'
                      ? T.CARPET
                      : T.FLOOR
    for (let y = zone.y1; y <= zone.y2; y += 1) {
      for (let x = zone.x1; x <= zone.x2; x += 1) {
        setFloor(x, y, floorTile)
      }
    }
  }

  // Walled rooms — every department wing, leadership wing, both boardrooms,
  // and the town hall get a clearly visible wall around their perimeter. Doors
  // are punched through one wall so players can enter.
  const wallRoom = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    door: { x: number; y: number },
  ) => {
    for (let x = x1; x <= x2; x += 1) {
      setWall(x, y1)
      setWall(x, y2)
    }
    for (let y = y1; y <= y2; y += 1) {
      setWall(x1, y)
      setWall(x2, y)
    }
    setObj(door.x, door.y, T.DOOR)
    setFloor(door.x, door.y, T.FLOOR)
  }

  // Leadership Wing — door on south side, central
  wallRoom(LEADERSHIP_WING.x1, LEADERSHIP_WING.y1, LEADERSHIP_WING.x2, LEADERSHIP_WING.y2, { x: 8, y: LEADERSHIP_WING.y2 })

  // Partner offices inside the leadership wing (sub-rooms)
  for (const office of PARTNER_OFFICES) {
    wallRoom(office.x1, office.y1, office.x2, office.y2, { x: office.x1 + 1, y: office.y2 })
    setObj(office.deskX, office.deskY, T.OFFICE_DESK)
    setObj(office.deskX, office.deskY + 1, T.CHAIR)
    setObj(office.x2 - 1, office.y1 + 1, T.BOOKSHELF)
  }

  // North Boardroom
  wallRoom(18, 2, 36, 14, { x: 27, y: 14 })
  for (let x = 22; x <= 32; x += 1) setObj(x, 8, T.BOARDROOM_TABLE)
  for (let x = 22; x <= 32; x += 2) {
    setObj(x, 6, T.CHAIR)
    setObj(x, 10, T.CHAIR)
  }
  setObj(20, 4, T.WHITEBOARD)
  setObj(35, 4, T.PLANT)
  setObj(20, 12, T.PLANT)

  // East Boardroom
  wallRoom(76, 2, 93, 14, { x: 84, y: 14 })
  for (let x = 80; x <= 90; x += 1) setObj(x, 8, T.BOARDROOM_TABLE)
  for (let x = 80; x <= 90; x += 2) {
    setObj(x, 6, T.CHAIR)
    setObj(x, 10, T.CHAIR)
  }
  setObj(78, 4, T.WHITEBOARD)
  setObj(92, 4, T.PLANT)
  setObj(78, 12, T.PLANT)

  // Town Hall — long room with a stage at the front, audience floor, mic stand
  wallRoom(39, 2, 73, 14, { x: 56, y: 14 })
  // Stage tiles span x=53..58, y=3..4
  for (let x = 53; x <= 58; x += 1) {
    setFloor(x, 3, T.STAGE)
    setFloor(x, 4, T.STAGE)
  }
  setObj(55, 3, T.PODIUM) // mic stand at center-front of stage
  // Audience seating — three rows of chairs facing the stage
  for (const y of [8, 10, 12]) {
    for (const x of [44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68]) {
      setObj(x, y, T.CHAIR)
    }
  }
  setObj(40, 4, T.PLANT)
  setObj(72, 4, T.PLANT)

  // Department wings — 4×2 grid of nameplated cubicle rooms with a lead office
  for (const wing of DEPT_WINGS) {
    const x1 = wing.x1
    const y1 = wing.y1
    const x2 = x1 + DEPT_WING_W - 1
    const y2 = y1 + DEPT_WING_H - 1
    // Door on the south wall, centered
    wallRoom(x1, y1, x2, y2, { x: x1 + Math.floor(DEPT_WING_W / 2), y: y2 })
  }

  // Lead offices (sub-rooms inside each wing). Door faces south — same way
  // the player approaches from the wing's open floor — and the desk sits at
  // the top of the room so the walk-up path is unobstructed. Plant +
  // bookshelf live in the back corners so they never block the doorway.
  for (const office of OFFICE_WORLD.leadershipOffices.filter((o) => o.id.startsWith('lead-'))) {
    wallRoom(office.x1, office.y1, office.x2, office.y2, { x: office.deskX, y: office.y2 })
    setObj(office.deskX, office.deskY, T.OFFICE_DESK)
    setObj(office.deskX, office.deskY + 1, T.CHAIR)
    setObj(office.x2 - 1, office.y1 + 1, T.BOOKSHELF)
    setObj(office.x1 + 1, office.y1 + 1, T.PLANT)
  }

  // Cubicles — desk + chair pair for every assigned seat
  for (const cubicle of OFFICE_WORLD.cubicles) {
    setObj(cubicle.x, cubicle.y, T.CUBICLE)
    setObj(cubicle.seatX, cubicle.seatY, T.CHAIR)
  }

  // Lobby — Plutus21 logo as a floor decal centered in the upper lobby,
  // plants framing the entry from the south band.
  setObj(49, 58, T.LOGO_SIGN)
  setObj(46, 61, T.PLANT)
  setObj(58, 61, T.PLANT)

  // Lounge — cluster of sofas + plants
  for (let x = 4; x <= 20; x += 4) setObj(x, 60, T.SOFA)
  setObj(3, 58, T.PLANT)
  setObj(22, 58, T.PLANT)

  // Focus Pods — single-seat private booths
  for (let x = 28; x <= 42; x += 3) {
    setObj(x, 59, T.DESK_V)
    setObj(x, 60, T.CHAIR)
  }

  // Break Room — coffee + sofas
  setObj(61, 58, T.COFFEE)
  setObj(63, 58, T.COFFEE)
  for (let x = 65; x <= 75; x += 4) setObj(x, 60, T.SOFA)

  // Help Desk — notice board + whiteboard for the People Ops corner
  setObj(81, 58, T.NOTICE)
  setObj(83, 58, T.WHITEBOARD)
  setObj(92, 58, T.PLANT)

  return { tileMap, floorMap }
}
