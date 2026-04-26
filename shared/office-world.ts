export const OFFICE_TILE_SIZE = 32
export const OFFICE_MAP_WIDTH = 56
export const OFFICE_MAP_HEIGHT = 36
export const OFFICE_SPAWN = { x: 28, y: 32 }

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
} as const

export type OfficeTileType = (typeof OFFICE_TILE)[keyof typeof OFFICE_TILE]
export type OfficeRoomType =
  | 'lobby'
  | 'department'
  | 'cubicles'
  | 'leadership'
  | 'meeting'
  | 'huddle'
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
  audioMode: 'open' | 'room' | 'private'
}

export type OfficeCubicleDefinition = {
  id: string
  label: string
  x: number
  y: number
  seatX: number
  seatY: number
}

export type OfficeLeadershipOfficeDefinition = {
  id: string
  label: string
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
}

export type OfficeMapData = {
  tileMap: number[][]
  floorMap: number[][]
}

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
    { id: 'lobby', label: 'Plutus21 Lobby', type: 'lobby', x1: 18, y1: 27, x2: 38, y2: 34, audioMode: 'open' },
    { id: 'quant', label: 'Quantitative Engineering', type: 'department', x1: 3, y1: 10, x2: 15, y2: 21, audioMode: 'open' },
    { id: 'vc', label: 'Value Creation', type: 'department', x1: 20, y1: 10, x2: 35, y2: 21, audioMode: 'open' },
    { id: 'growth', label: 'Growth and Strategy', type: 'department', x1: 40, y1: 10, x2: 52, y2: 21, audioMode: 'open' },
    { id: 'cubicles', label: 'Team Cubicles', type: 'cubicles', x1: 4, y1: 23, x2: 18, y2: 33, audioMode: 'open' },
    { id: 'leadership', label: 'Leadership Wing', type: 'leadership', x1: 2, y1: 2, x2: 23, y2: 8, audioMode: 'private' },
    { id: 'meeting-east', label: 'East Boardroom', type: 'meeting', x1: 33, y1: 2, x2: 52, y2: 8, audioMode: 'room' },
    { id: 'huddle-a', label: 'Huddle A', type: 'huddle', x1: 25, y1: 2, x2: 31, y2: 7, audioMode: 'room' },
    { id: 'focus-pods', label: 'Focus Pods', type: 'focus', x1: 40, y1: 23, x2: 52, y2: 27, audioMode: 'private' },
    { id: 'lounge', label: 'Lounge', type: 'lounge', x1: 21, y1: 23, x2: 36, y2: 29, audioMode: 'open' },
    { id: 'break-room', label: 'Break Room', type: 'break', x1: 40, y1: 29, x2: 52, y2: 33, audioMode: 'open' },
    { id: 'help-desk', label: 'People Ops Help Desk', type: 'support', x1: 20, y1: 30, x2: 26, y2: 34, audioMode: 'open' },
  ],
  cubicles: Array.from({ length: 24 }, (_, index) => {
    const col = index % 6
    const row = Math.floor(index / 6)
    const x = 5 + col * 2
    const y = 24 + row * 2
    return {
      id: `cubicle-${index + 1}`,
      label: `Cubicle ${index + 1}`,
      x,
      y,
      seatX: x,
      seatY: y + 1,
    }
  }),
  leadershipOffices: Array.from({ length: 6 }, (_, index) => {
    const x1 = 3 + index * 3
    return {
      id: `leadership-office-${index + 1}`,
      label: `Leadership Office ${index + 1}`,
      x1,
      y1: 3,
      x2: x1 + 2,
      y2: 7,
      deskX: x1 + 1,
      deskY: 4,
    }
  }),
  interactables: [
    { id: 'main-logo', label: 'Plutus21', kind: 'logo', x: 28, y: 28, zoneId: 'lobby' },
    { id: 'org-chart', label: 'Org Chart', kind: 'deep-link', x: 22, y: 31, href: '/admin/org-chart', zoneId: 'help-desk' },
    { id: 'reports', label: 'Performance Reports', kind: 'deep-link', x: 24, y: 31, href: '/admin/reports', zoneId: 'help-desk' },
    { id: 'hr-help', label: 'HR Help Desk', kind: 'help-desk', x: 21, y: 32, href: '/device-tickets', zoneId: 'help-desk' },
    { id: 'quant-sign', label: 'Quantitative Engineering', kind: 'department-sign', x: 9, y: 10, zoneId: 'quant' },
    { id: 'vc-sign', label: 'Value Creation', kind: 'department-sign', x: 27, y: 10, zoneId: 'vc' },
    { id: 'growth-sign', label: 'Growth and Strategy', kind: 'department-sign', x: 46, y: 10, zoneId: 'growth' },
  ],
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
    OFFICE_TILE.LOGO_SIGN,
    OFFICE_TILE.CUBICLE,
    OFFICE_TILE.OFFICE_DESK,
    OFFICE_TILE.NOTICE,
  ]
  return !blockedTiles.includes(tile)
}

export function getOfficeZoneAt(x: number, y: number, world = OFFICE_WORLD) {
  return (
    world.zones.find((zone) => x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) ||
    null
  )
}

export function generateOfficeMap(world = OFFICE_WORLD): OfficeMapData {
  const T = OFFICE_TILE
  const tileMap = Array.from({ length: world.height }, () => new Array(world.width).fill(T.FLOOR))
  const floorMap = Array.from({ length: world.height }, () => new Array(world.width).fill(T.FLOOR))
  const setWall = (x: number, y: number) => {
    tileMap[y][x] = T.WALL
    floorMap[y][x] = T.WALL
  }
  const setFloor = (x: number, y: number, tile: number) => {
    tileMap[y][x] = tile
    floorMap[y][x] = tile
  }
  const setObj = (x: number, y: number, tile: number) => {
    tileMap[y][x] = tile
  }

  for (let x = 0; x < world.width; x += 1) {
    setWall(x, 0)
    setWall(x, 1)
    setWall(x, world.height - 1)
  }
  for (let y = 0; y < world.height; y += 1) {
    setWall(0, y)
    setWall(world.width - 1, y)
  }

  for (const zone of world.zones) {
    const floorTile =
      zone.type === 'meeting' || zone.type === 'huddle'
        ? T.MEETING
        : zone.type === 'lounge'
          ? T.LOUNGE
          : zone.type === 'break' || zone.type === 'focus'
            ? T.CARPET
            : zone.type === 'lobby'
              ? T.RUG
              : T.FLOOR
    for (let y = zone.y1; y <= zone.y2; y += 1) {
      for (let x = zone.x1; x <= zone.x2; x += 1) {
        setFloor(x, y, floorTile)
      }
    }
  }

  for (const office of world.leadershipOffices) {
    for (let x = office.x1; x <= office.x2; x += 1) {
      setWall(x, office.y1)
      setWall(x, office.y2)
    }
    for (let y = office.y1; y <= office.y2; y += 1) {
      setWall(office.x1, y)
      setWall(office.x2, y)
    }
    setObj(office.x1 + 1, office.y2, T.DOOR)
    setObj(office.deskX, office.deskY, T.OFFICE_DESK)
    setObj(office.deskX, office.deskY + 1, T.CHAIR)
  }

  for (const cubicle of world.cubicles) {
    setObj(cubicle.x, cubicle.y, T.CUBICLE)
    setObj(cubicle.seatX, cubicle.seatY, T.CHAIR)
  }

  for (let x = 34; x <= 51; x += 1) {
    setObj(x, 5, T.DESK_H)
  }
  for (const x of [37, 41, 45, 49]) {
    setObj(x, 4, T.CHAIR)
    setObj(x, 6, T.CHAIR)
  }
  for (let x = 24; x <= 30; x += 1) setObj(x, 5, T.DESK_H)
  for (let x = 22; x <= 34; x += 1) setObj(x, 25, T.SOFA)
  for (let x = 43; x <= 50; x += 2) setObj(x, 25, T.DESK_V)
  for (const [x, y] of [
    [7, 10],
    [17, 24],
    [36, 24],
    [52, 30],
    [18, 28],
    [38, 28],
    [3, 22],
    [52, 22],
  ]) setObj(x, y, T.PLANT)
  setObj(28, 28, T.LOGO_SIGN)
  setObj(21, 31, T.NOTICE)
  setObj(24, 31, T.WHITEBOARD)
  setObj(51, 31, T.COFFEE)

  return { tileMap, floorMap }
}
