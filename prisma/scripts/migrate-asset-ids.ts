/**
 * One-time migration: remap every EquipmentAsset's free-text category to a
 * predefined value and renumber its human-facing equipmentId into the new
 * category-based scheme (e.g. the oldest Laptop becomes LAP-0001).
 *
 *   node --import tsx prisma/scripts/migrate-asset-ids.ts            # dry run (default)
 *   node --import tsx prisma/scripts/migrate-asset-ids.ts --apply    # write changes
 *
 * Idempotent: assets already in the new scheme keep their ID and seed the
 * per-prefix counters. EquipmentEvent/EquipmentAssignment reference the internal
 * `id`, so history is preserved — only the display equipmentId changes.
 */
import { prisma } from '../../lib/db'
import { getAssetCategoryMeta, getEquipmentIdPrefix, remapCategory } from '../../lib/asset-utils'
import { ASSET_EVENT_TYPES, recordAssetEvent } from '../../lib/asset-events'

const APPLY = process.argv.includes('--apply')
const ID_PAD = 4

/** True when the asset's category is already predefined and its ID matches that prefix. */
function isAlreadyMigrated(equipmentId: string, category: string): boolean {
  const meta = getAssetCategoryMeta(category)
  if (!meta) return false
  return new RegExp(`^${meta.idPrefix}-\\d{${ID_PAD},}$`).test(equipmentId.trim().toUpperCase())
}

async function main() {
  const assets = await prisma.equipmentAsset.findMany({
    select: { id: true, equipmentId: true, category: true },
    orderBy: { createdAt: 'asc' },
  })

  const plan = assets.map((asset) => {
    const newCategory = remapCategory(asset.category)
    return {
      id: asset.id,
      oldEquipmentId: asset.equipmentId || '',
      oldCategory: asset.category,
      newCategory,
      prefix: getEquipmentIdPrefix(newCategory),
      migrated: isAlreadyMigrated(asset.equipmentId || '', asset.category),
    }
  })

  // Seed per-prefix counters from assets already in the new scheme so we never reuse a number.
  const counters = new Map<string, number>()
  for (const entry of plan) {
    if (!entry.migrated) continue
    const match = entry.oldEquipmentId.trim().toUpperCase().match(new RegExp(`^${entry.prefix}-(\\d+)$`))
    if (!match) continue
    const numeric = Number(match[1])
    if (Number.isFinite(numeric)) {
      counters.set(entry.prefix, Math.max(counters.get(entry.prefix) || 0, numeric))
    }
  }

  // Assign new IDs (oldest first within each prefix, preserved by the createdAt ordering).
  const changes = plan
    .map((entry) => {
      if (entry.migrated) {
        // Keep the ID; only surface a category casing/remap fix if one applies.
        return entry.newCategory !== entry.oldCategory
          ? { ...entry, newEquipmentId: entry.oldEquipmentId }
          : null
      }
      const next = (counters.get(entry.prefix) || 0) + 1
      counters.set(entry.prefix, next)
      return { ...entry, newEquipmentId: `${entry.prefix}-${String(next).padStart(ID_PAD, '0')}` }
    })
    .filter((change): change is NonNullable<typeof change> => change !== null)

  console.log(`Assets: ${assets.length} | Pending changes: ${changes.length} | Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
  for (const change of changes) {
    const idPart =
      change.oldEquipmentId === change.newEquipmentId
        ? change.newEquipmentId
        : `${change.oldEquipmentId} -> ${change.newEquipmentId}`
    const catPart =
      change.oldCategory === change.newCategory
        ? change.newCategory
        : `${change.oldCategory} -> ${change.newCategory}`
    console.log(`  ${idPart}  [${catPart}]`)
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write changes.')
    return
  }

  if (changes.length === 0) {
    console.log('\nNothing to change.')
    return
  }

  const idChanges = changes.filter((change) => change.oldEquipmentId !== change.newEquipmentId)

  await prisma.$transaction(
    async (tx) => {
      // Phase A: park every changing ID on a unique temporary value so the final
      // targets are all free (avoids transient unique-constraint collisions).
      for (const change of idChanges) {
        await tx.equipmentAsset.update({
          where: { id: change.id },
          data: { equipmentId: `MIGRATING-${change.id}` },
        })
      }

      // Phase B: write the final equipmentId + category and log a migration event.
      for (const change of changes) {
        await tx.equipmentAsset.update({
          where: { id: change.id },
          data: { equipmentId: change.newEquipmentId, category: change.newCategory },
        })
        await recordAssetEvent(tx, {
          assetId: change.id,
          actorId: null,
          eventType: ASSET_EVENT_TYPES.MIGRATED,
          payload: {
            oldEquipmentId: change.oldEquipmentId,
            newEquipmentId: change.newEquipmentId,
            oldCategory: change.oldCategory,
            newCategory: change.newCategory,
          },
        })
      }
    },
    { timeout: 120_000 }
  )

  console.log(`\nApplied ${changes.length} change(s).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
