# Compass Asset Management — Enhancements Design

**Date:** 2026-07-08
**Module:** Equipment / Asset Management (`EquipmentAsset`, `EquipmentAssignment`, `EquipmentEvent`)

## Goal

Deliver the 8 requested enhancements to the Asset Management module: predefined categories,
laptop-specific spec fields, category-based search, current-owner names on QR labels, a complete
asset lifecycle/status audit trail with manual override, a hierarchical Country→City office-location
dropdown, category-based asset IDs, and a purchase-type field.

## Resolved decisions

- **Existing asset IDs:** renumber ALL existing assets into the new category-based scheme (one-time
  data migration). Printed QR labels will be reprinted from fresh downloads.
- **"Damaged":** stays an `AssetCondition` (no status enum change). The lifecycle log records both
  status changes and condition changes.
- **Existing free-text categories:** remapped to the predefined list now (unknown → Other Accessories).
- **Categories / locations / purchase types:** fixed code constants (not admin-editable tables).
- **Mouse / Bag ID prefixes:** `MOU` / `BAG`. IDs are 4-digit zero-padded (`LAP-0001`).

## Data model

Single schema change: add `purchaseType String?` to `EquipmentAsset` (validated on write against
`PURCHASE_TYPES`; nullable so existing rows are unaffected).

Reused as-is:
- `specsJson Json?` — holds laptop specs `{ processor, ram, storage }`.
- `EquipmentEvent` (`eventType String`, `payloadJson Json?`, `actorId`) — lifecycle audit trail.
- `category String`, `location String` — remain validated strings (enforced against constants).

## Constants (`lib/asset-utils.ts` + new `lib/office-locations.ts`)

- `ASSET_CATEGORIES`: ordered list of `{ value, label, idPrefix, hasSpecs }`:
  - Laptops → `LAP` (hasSpecs), Mobile Phones → `MOB`, External Monitors → `MON`,
    YubiKeys → `YUB`, Mouse → `MOU`, Bag → `BAG`, Headphones / Earphones → `AUD`,
    Other Accessories → `ACC`.
- `OFFICE_LOCATIONS`: ordered `{ country, cities[] }` groups (Pakistan: Karachi, Islamabad, Lahore,
  Hyderabad, Larkana; Morocco: Casablanca, Fnideq, Kenitra, Meknes; United States: Dallas;
  Colombia: Pereira; Indonesia: Jakarta). Stored value = city string. Existing 5 cities all belong to
  the new list, so existing data validates unchanged. `LEGACY_LOCATION_ALIASES` retained.
- `PURCHASE_TYPES`: `Brand New`, `Refurbished`, `Used`.
- `CATEGORY_REMAP`: keyword→category table used only by the data-migration script.

## Feature designs

### 1 & 3 — Predefined categories + category filtering
`category` becomes a `<Select>` sourced from `ASSET_CATEGORIES` in the create/edit form; the search
bar's category filter uses the same constant (instead of accumulating distinct values from rows).
Server `createAssetSchema`/`updateAssetSchema` validate `category ∈ ASSET_CATEGORIES`.

### 2 — Laptop-specific fields
`specsJson` shape `{ processor?: string, ram?: string, storage?: string }`. The three inputs render
in the form and detail view **only when the selected category is Laptops** (`hasSpecs`). Values are
optional trimmed strings.

### 5 — Owner name on QR labels
`AssetQrLabelItem` and the qr-label route SELECTs include the current assignee's name. Each PDF label
renders the owner in a small font below the equipment ID (`Unassigned` when none).

### 6 — Lifecycle history + manual status override
- New helper `recordAssetEvent(client, { assetId, actorId, eventType, payload })` in `lib/asset-events.ts`;
  all existing inline `equipmentEvent.create` sites route through it.
- Canonical `eventType`s: `ASSET_CREATED`, `ASSET_UPDATED`, `ASSET_ASSIGNED`, `ASSET_UNASSIGNED`,
  `STATUS_CHANGED` (`{ from, to, note }`), `CONDITION_CHANGED` (`{ from, to }`),
  `ASSET_IMPORTED_CREATED`, `ASSET_IMPORTED_UPDATED`, plus migration events.
  "Returned from Repair" = `STATUS_CHANGED` `IN_REPAIR → IN_STOCK`; "Disposed"/"Lost" =
  `STATUS_CHANGED` to those; "Damaged" = `CONDITION_CHANGED` to `DAMAGED`.
- New endpoint `POST /api/assets/[id]/status` (`canManageAssets`): `{ status, note? }` sets any valid
  status directly (the manual override — bypasses the "can't change status while assigned" guard on
  PATCH), logging `STATUS_CHANGED` with actor + timestamp. Assign/unassign continue to log their events.
- `AssetHistoryTimeline` gains a human-readable formatter (`lib/asset-event-format.ts`) mapping
  `eventType` + payload → friendly text, replacing the raw JSON dump.

### 7 — Hierarchical office-location dropdown
`OFFICE_LOCATIONS` replaces the flat `ASSET_LOCATIONS`. The form/filter use a grouped `<Select>`
(country headers, city options). Server validation and `/api/assets/locations` counts use the flattened
city list. Legacy aliases preserved.

### 8 — Category-based asset IDs
`getNextEquipmentId(categoryValue, existingIdsForPrefix)` → `${idPrefix}-${(max+1).padStart(4,'0')}`.
Manual ID override in the form still allowed. The create route keeps its retry-on-`P2002` safety,
scoped to the category prefix. `next-equipment-id` route takes a `category` query param.

### 9 — Purchase type
`purchaseType` `<Select>` in the form (optional), shown in detail, and a `purchaseType` filter on the
list GET + `AssetFilters`.

## One-time data migration (`prisma/scripts/migrate-asset-ids.ts`)

Guarded one-off script with `--dry-run` (default prints, `--apply` writes):
1. For each asset, remap its free-text `category` to a predefined value via `CATEGORY_REMAP`
   (unknown → Other Accessories).
2. Assign a new category-based `equipmentId` sequentially, ordered by `createdAt` asc within each
   prefix (oldest Laptop → `LAP-0001`). Uniqueness enforced; assets already in the new format are
   skipped (idempotent).
3. Write an `EquipmentEvent` (`ASSET_MIGRATED`, payload `{ oldEquipmentId, oldCategory }`) per asset.
Run once against production after the code deploys. `EquipmentEvent`/`EquipmentAssignment` reference
the internal `id`, so history is preserved; only the human-facing `equipmentId` changes.

## Testing

`node --import tsx --test` units for: category-aware `getNextEquipmentId`, the category-remap function,
office-location validation/normalization, the event formatter, and the migration script's dry-run
mapping. Existing `asset-utils`/`asset-qr` tests updated for the new ID format.

## Build order (phases)

1. Constants + `purchaseType` schema/migration + `recordAssetEvent` helper.
2. Predefined categories + category filtering + laptop spec fields.
3. Hierarchical office locations.
4. Category-based IDs + one-time data migration script.
5. Purchase type field.
6. QR owner name.
7. Lifecycle events + manual status override + human-readable timeline.

## Non-goals

- No admin CRUD for categories/locations/purchase types (fixed constants).
- No change to the `AssetStatus`/`AssetCondition` enums.
- No automatic reprinting of QR labels (users re-download after the migration).
