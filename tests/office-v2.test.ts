import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OFFICE_MAP_HEIGHT,
  OFFICE_MAP_WIDTH,
  OFFICE_WORLD,
  generateOfficeMap,
  getOfficeZoneAt,
  isOfficeTileWalkable,
} from '../shared/office-world'
import {
  isSeniorManagementPosition,
  resolveAvatarV2Settings,
} from '../shared/avatar-v2'

test('office v2 world map matches the shared world dimensions', () => {
  const map = generateOfficeMap(OFFICE_WORLD)

  assert.equal(map.tileMap.length, OFFICE_MAP_HEIGHT)
  assert.equal(map.floorMap.length, OFFICE_MAP_HEIGHT)
  assert.equal(map.tileMap[0].length, OFFICE_MAP_WIDTH)
  assert.equal(map.floorMap[0].length, OFFICE_MAP_WIDTH)
  assert.equal(getOfficeZoneAt(OFFICE_WORLD.spawn.x, OFFICE_WORLD.spawn.y)?.id, 'lobby')
})

test('office v2 collision blocks cubicles but lets players walk on the lobby logo decal', () => {
  const map = generateOfficeMap(OFFICE_WORLD)
  const logoInteractable = OFFICE_WORLD.interactables.find((i) => i.kind === 'logo')!
  const logoTile = map.tileMap[logoInteractable.y][logoInteractable.x]
  const cubicle = OFFICE_WORLD.cubicles[0]

  // Logo renders as a floor decal in the lobby — walkable on purpose.
  assert.equal(isOfficeTileWalkable(logoTile), true)
  // Cubicle desks remain solid props.
  assert.equal(isOfficeTileWalkable(map.tileMap[cubicle.y][cubicle.x]), false)
})

test('office v2 has 8 department wings each with 6 cubicles and a lead office', () => {
  const departments = [
    'Technology',
    'Value Creation',
    'Growth and Strategy',
    'Ops and Accounting',
    'HR',
    'Design',
    '1to1 plans',
    'Product',
  ]

  for (const dept of departments) {
    const wingCubicles = OFFICE_WORLD.cubicles.filter((c) => c.department === dept)
    assert.equal(wingCubicles.length, 6, `${dept} wing should have 6 cubicles`)

    const leadOffice = OFFICE_WORLD.leadershipOffices.find((o) => o.department === dept)
    assert.ok(leadOffice, `${dept} should have a lead office`)
  }
})

test('office v2 town hall has stage tiles inside the zone', () => {
  assert.ok(OFFICE_WORLD.stageTiles.length > 0, 'town hall should expose stage tiles')
  for (const tile of OFFICE_WORLD.stageTiles) {
    assert.equal(tile.zoneId, 'town-hall')
    const zone = getOfficeZoneAt(tile.x, tile.y)
    assert.equal(zone?.id, 'town-hall', `stage tile (${tile.x},${tile.y}) should sit inside the town hall zone`)
  }
})

test('senior office eligibility recognizes partner and c-level titles', () => {
  assert.equal(isSeniorManagementPosition('Junior Partner'), true)
  assert.equal(isSeniorManagementPosition('Chief Investment Officer'), true)
  assert.equal(isSeniorManagementPosition('Senior Associate'), false)
})

test('avatar v2 resolves hijab as covered hair without rendering hair fields', () => {
  const avatar = resolveAvatarV2Settings('user-1', {
    avatarSchemaVersion: 2,
    avatarBodyFrame: 'feminine',
    avatarOutfitType: 'blazer',
    avatarOutfitColor: '#2563eb',
    avatarOutfitAccentColor: '#f8fafc',
    avatarHairCategory: 'covered',
    avatarHeadCoveringType: 'hijab',
    avatarHeadCoveringColor: '#334155',
    avatarSkinTone: '#8d5524',
    avatarAccessories: ['glasses', 'badge'],
  })

  assert.equal(avatar.avatarHeadCoveringType, 'hijab')
  assert.equal(avatar.avatarHairCategory, 'covered')
  assert.deepEqual(avatar.avatarAccessories, ['glasses', 'badge'])
})

test('avatar v2 returns deterministic defaults until setup is completed', () => {
  // No v2 fields set — resolveAvatarV2Settings should treat the user as a
  // first-time user and produce deterministic defaults (no head covering,
  // no accessories) regardless of any partial input.
  const avatar = resolveAvatarV2Settings('user-legacy', {
    avatarSchemaVersion: 2,
    avatarHeadCoveringType: 'hijab',
    avatarAccessories: ['glasses'],
  })

  assert.equal(avatar.avatarSchemaVersion, 2)
  assert.equal(avatar.avatarHeadCoveringType, 'none')
  assert.deepEqual(avatar.avatarAccessories, [])
})
