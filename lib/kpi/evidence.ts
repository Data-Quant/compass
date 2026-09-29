import type { EvidenceTypeValue } from './view-types'

/** Vercel rejects function request bodies over 4.5 MB, so uploads stop at 4 MB; larger proof is linked. */
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024

export type EvidenceKind = 'pdf' | 'png' | 'jpg' | 'webp' | 'xlsx' | 'docx' | 'csv'
export type EvidenceUploadCheck =
  | { ok: true; kind: EvidenceKind; contentType: string; fileName: string }
  | { ok: false; error: string }

const CONTENT_TYPES: Record<EvidenceKind, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value)
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
}

function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false
  for (let index = 0; index < Math.min(bytes.length, 4096); index += 1) {
    if (bytes[index] === 0) return false
  }
  return true
}

/** Detects the file kind from its bytes; Office files are ZIP containers, so they also need the matching extension. */
export function detectEvidenceKind(fileName: string, bytes: Uint8Array): EvidenceKind | null {
  const extension = extensionOf(fileName)
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg'
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return extension === 'xlsx' ? 'xlsx' : extension === 'docx' ? 'docx' : null
  if (extension === 'csv' && looksLikeText(bytes)) return 'csv'
  return null
}

export function safeFileName(fileName: string, kind: EvidenceKind): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? ''
  const stem = baseName
    .replace(/\.[^.]*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${stem || 'evidence'}.${kind}`
}

export function checkEvidenceUpload(fileName: string, bytes: Uint8Array): EvidenceUploadCheck {
  if (bytes.length === 0) return { ok: false, error: 'The file is empty' }
  if (bytes.length > MAX_EVIDENCE_BYTES) return { ok: false, error: 'Files must be 4 MB or smaller; link larger proof instead' }
  const kind = detectEvidenceKind(fileName, bytes)
  if (!kind) return { ok: false, error: 'Upload a PDF, image (PNG, JPEG, WebP), Excel, Word or CSV file' }
  return { ok: true, kind, contentType: CONTENT_TYPES[kind], fileName: safeFileName(fileName, kind) }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export interface ClaimEvidence { url: string | null; reportedValue: string | null; fileCount: number }

/** The proof each evidence type needs before a KPI can be claimed done. */
export function claimEvidenceError(type: EvidenceTypeValue, evidence: ClaimEvidence): string | null {
  if (evidence.url && !isHttpUrl(evidence.url)) return 'Links must start with http:// or https://'
  switch (type) {
    case 'LINK':
      return evidence.url ? null : 'Add the link that shows this KPI was done'
    case 'DOCUMENT':
      return evidence.fileCount > 0 ? null : 'Upload the document that shows this KPI was done'
    case 'NUMBER':
      return evidence.reportedValue?.trim() ? null : 'Enter the number achieved'
    case 'CLIENT_CONFIRMATION':
      return evidence.fileCount > 0 || evidence.url ? null : 'Upload or link the client confirmation'
  }
}
