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
  assert.equal(getOfficeZoneAt(28, 32)?.id, 'lobby')
})

test('office v2 collision treats branded signs and cubicles as non-walkable', () => {
  const map = generateOfficeMap(OFFICE_WORLD)
  const logoTile = map.tileMap[28][28]
  const cubicle = OFFICE_WORLD.cubicles[0]

  assert.equal(isOfficeTileWalkable(logoTile), false)
  assert.equal(isOfficeTileWalkable(map.tileMap[cubicle.y][cubicle.x]), false)
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
