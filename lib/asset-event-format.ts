// Human-readable descriptions for asset lifecycle events, keyed by eventType.
// Pure and client-safe (no server imports) so the timeline can render it directly.

function statusLabel(value: unknown): string {
  return String(value ?? '').replace(/_/g, ' ').trim() || 'unknown'
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function formatAssetEvent(eventType: string, payload: unknown): string {
  const p = asRecord(payload)
  const note = str(p.note)
  const noteSuffix = note ? ` — ${note}` : ''

  switch (eventType) {
    case 'ASSET_CREATED':
      return str(p.equipmentId) ? `Asset created (${str(p.equipmentId)})` : 'Asset created'
    case 'ASSET_UPDATED': {
      const fields = Array.isArray(p.fields) ? (p.fields as unknown[]).map(String) : []
      return fields.length ? `Details updated: ${fields.join(', ')}` : 'Details updated'
    }
    case 'ASSET_ASSIGNED':
      return `Assigned to ${str(p.employeeName) || 'an employee'}${noteSuffix}`
    case 'ASSET_UNASSIGNED':
      return `Unassigned${p.nextStatus ? ` (now ${statusLabel(p.nextStatus)})` : ''}${noteSuffix}`
    case 'STATUS_CHANGED':
      return `Status changed${p.from ? ` from ${statusLabel(p.from)}` : ''} to ${statusLabel(p.to)}${noteSuffix}`
    case 'CONDITION_CHANGED':
      return `Condition changed${p.from ? ` from ${statusLabel(p.from)}` : ''} to ${statusLabel(p.to)}`
    case 'ASSET_IMPORTED_CREATED':
      return `Imported (created)${str(p.fileName) ? ` from ${str(p.fileName)}` : ''}`
    case 'ASSET_IMPORTED_UPDATED':
      return `Imported (updated)${str(p.fileName) ? ` from ${str(p.fileName)}` : ''}`
    case 'ASSET_MIGRATED': {
      const idPart =
        str(p.oldEquipmentId) && str(p.newEquipmentId)
          ? `${str(p.oldEquipmentId)} → ${str(p.newEquipmentId)}`
          : ''
      const catPart =
        str(p.oldCategory) && str(p.newCategory) && p.oldCategory !== p.newCategory
          ? ` (category ${str(p.oldCategory)} → ${str(p.newCategory)})`
          : ''
      return `Renumbered${idPart ? ` ${idPart}` : ''}${catPart}`
    }
    default:
      return eventType.replace(/_/g, ' ')
  }
}
