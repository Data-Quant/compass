import { get, put } from '@vercel/blob'

export interface StoredEvidence { stream: ReadableStream<Uint8Array>; contentType: string }

export interface EvidenceStore {
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<string>
  get(pathname: string): Promise<StoredEvidence | null>
}

export function vercelEvidenceStore(token: string): EvidenceStore {
  return {
    async put(pathname, bytes, contentType) {
      const blob = await put(pathname, Buffer.from(bytes), { access: 'private', addRandomSuffix: true, contentType, token })
      return blob.pathname
    },
    async get(pathname) {
      const result = await get(pathname, { access: 'private', token })
      if (!result || result.statusCode !== 200 || !result.stream) return null
      return { stream: result.stream, contentType: result.blob.contentType || 'application/octet-stream' }
    },
  }
}

/** In-memory store for tests. */
export function memoryEvidenceStore(): EvidenceStore {
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>()
  return {
    async put(pathname, bytes, contentType) {
      files.set(pathname, { bytes, contentType })
      return pathname
    },
    async get(pathname) {
      const file = files.get(pathname)
      if (!file) return null
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(file.bytes)
          controller.close()
        },
      })
      return { stream, contentType: file.contentType }
    },
  }
}

/** The configured store, or null when uploads are not set up in this environment. */
export function configuredEvidenceStore(env: Record<string, string | undefined> = process.env): EvidenceStore | null {
  return env.BLOB_READ_WRITE_TOKEN ? vercelEvidenceStore(env.BLOB_READ_WRITE_TOKEN) : null
}
