// §8 Evidence rules: PNG, JPG, PDF only; ≤10 MB each; per-subtask file count
// within the campaign limit. Validation happens client-side and again on the
// server (declared metadata before a token is issued, file bytes after upload).
// A file that fails is never recorded and its blob is deleted immediately.
import { LIMITS } from './types'

export type EvidenceMime = 'image/png' | 'image/jpeg' | 'application/pdf'

const EXTENSION_MIME: Readonly<Record<string, EvidenceMime>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
}

export const ALLOWED_EVIDENCE_MIMES: readonly EvidenceMime[] = ['image/png', 'image/jpeg', 'application/pdf']
export const EVIDENCE_ACCEPT_ATTRIBUTE = '.png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf'

/** §8 "Never requested, never uploaded" — shown in the task and again at upload. */
export const PROHIBITED_EVIDENCE = [
  'MFA / OTP codes',
  'Backup or recovery codes',
  'QR codes',
  'Authenticator seeds or secrets',
  'Passwords',
] as const

export function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim())
  return match ? match[1].toLowerCase() : ''
}

export interface EvidenceMeta {
  fileName: string
  contentType: string
  size: number
}

export type EvidenceCheck = { ok: true; mime: EvidenceMime } | { ok: false; error: string }

const RETRY = 'Choose a PNG, JPG or PDF under 10 MB and try again.'

export function validateEvidenceMeta(meta: EvidenceMeta, uploadedThisRound: number, fileLimit: number): EvidenceCheck {
  const mime = EXTENSION_MIME[extensionOf(meta.fileName)]
  if (!mime) return { ok: false, error: `Only PNG, JPG and PDF files are allowed. ${RETRY}` }
  if (meta.contentType.toLowerCase() !== mime) {
    return { ok: false, error: `The file type does not match its extension. ${RETRY}` }
  }
  if (!Number.isFinite(meta.size) || meta.size <= 0) return { ok: false, error: `The file is empty. ${RETRY}` }
  if (meta.size > LIMITS.maxFileBytes) return { ok: false, error: `The file is larger than 10 MB. ${RETRY}` }
  if (uploadedThisRound >= fileLimit) {
    return { ok: false, error: `You can attach at most ${fileLimit} file${fileLimit === 1 ? '' : 's'} here. Remove one to add another.` }
  }
  return { ok: true, mime }
}

/** Detects the real format from magic bytes. */
export function sniffEvidenceMime(bytes: Uint8Array): EvidenceMime | null {
  const starts = (signature: readonly number[]) => signature.every((byte, index) => bytes[index] === byte)
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'
  return null
}

export function validateEvidenceContent(declared: EvidenceMime, bytes: Uint8Array): string | null {
  const actual = sniffEvidenceMime(bytes)
  if (!actual) return `The file contents are not a valid PNG, JPG or PDF. ${RETRY}`
  if (actual !== declared) return `The file contents do not match its extension. ${RETRY}`
  return null
}

export function safeStorageName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '')
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'evidence'
  )
}

export const EVIDENCE_PATH_PREFIX = 'security-evidence/'

export function evidencePathPrefix(taskId: string, subtaskId: string): string {
  return `${EVIDENCE_PATH_PREFIX}${taskId}/${subtaskId}/`
}

/** Display name: strips path separators and control characters, keeps the extension. */
export function cleanDisplayName(fileName: string): string {
  const name = fileName.split(/[\\/]/).pop() ?? ''
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return cleaned.slice(0, 120) || 'evidence'
}
