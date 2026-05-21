import crypto from 'crypto'

const ENCRYPTION_PREFIX = 'p21enc:v1'
const SENSITIVE_PAYROLL_PROFILE_FIELDS = [
  'cnicNumber',
  'bankName',
  'accountTitle',
  'accountNumber',
] as const

type SensitivePayrollProfileField = (typeof SENSITIVE_PAYROLL_PROFILE_FIELDS)[number]
type SensitivePayrollProfilePayload = Partial<Record<SensitivePayrollProfileField, string | null>>

function getEncryptionKey() {
  const raw = process.env.PAYROLL_FIELD_ENCRYPTION_KEY?.trim()
  if (!raw) return null

  if (/^[a-fA-F0-9]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }

  const base64 = Buffer.from(raw, 'base64')
  if (base64.length === 32) return base64

  const utf8 = Buffer.from(raw, 'utf8')
  if (utf8.length === 32) return utf8

  throw new Error('PAYROLL_FIELD_ENCRYPTION_KEY must be a 32-byte base64, 64-character hex, or 32-character string key')
}

export function isEncryptedPayrollField(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith(`${ENCRYPTION_PREFIX}:`)
}

export function encryptPayrollField(field: SensitivePayrollProfileField, value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return null
  if (isEncryptedPayrollField(trimmed)) return trimmed

  const key = getEncryptionKey()
  if (!key) {
    throw new Error('PAYROLL_FIELD_ENCRYPTION_KEY is required before saving payroll bank or ID details')
  }

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(field, 'utf8'))

  const ciphertext = Buffer.concat([
    cipher.update(trimmed, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    ENCRYPTION_PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export function decryptPayrollField(field: SensitivePayrollProfileField, value: string | null | undefined) {
  if (!value) return null
  if (!isEncryptedPayrollField(value)) return value

  const key = getEncryptionKey()
  if (!key) {
    throw new Error('PAYROLL_FIELD_ENCRYPTION_KEY is required to read encrypted payroll bank or ID details')
  }

  const parts = value.split(':')
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== ENCRYPTION_PREFIX) {
    throw new Error('Invalid encrypted payroll field format')
  }

  const [, , ivRaw, tagRaw, ciphertextRaw] = parts
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'))
  decipher.setAAD(Buffer.from(field, 'utf8'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function encryptSensitivePayrollProfileFields<T extends SensitivePayrollProfilePayload>(payload: T): T {
  const next = { ...payload }
  for (const field of SENSITIVE_PAYROLL_PROFILE_FIELDS) {
    next[field] = encryptPayrollField(field, payload[field]) as T[typeof field]
  }
  return next
}

export function decryptSensitivePayrollProfileFields<T extends SensitivePayrollProfilePayload | null | undefined>(
  profile: T
): T {
  if (!profile) return profile

  const next = { ...profile }
  for (const field of SENSITIVE_PAYROLL_PROFILE_FIELDS) {
    next[field] = decryptPayrollField(field, profile[field]) as typeof next[typeof field]
  }
  return next as T
}
