export const PROJECT_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export type ProjectImageMimeType = (typeof PROJECT_IMAGE_MIME_TYPES)[number]

export function isProjectImageMimeType(value: string): value is ProjectImageMimeType {
  return (PROJECT_IMAGE_MIME_TYPES as readonly string[]).includes(value)
}

export function detectProjectImageMimeType(bytes: Uint8Array): ProjectImageMimeType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png'

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.slice(0, 6))
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif'
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp'

  return null
}

export function projectImageExtension(mimeType: ProjectImageMimeType) {
  return mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length)
}
