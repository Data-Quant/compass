// Private Vercel Blob storage for evidence (encrypted at rest, no public URLs).
// Behind an interface so services can be tested without the network.
import { del, get, head, list } from '@vercel/blob'
import { SecurityChecksError } from './errors'

export interface StoredBlob {
  stream: ReadableStream<Uint8Array>
  contentType: string
  size: number
}

export interface BlobStore {
  head(pathname: string): Promise<{ size: number; contentType: string } | null>
  readPrefix(pathname: string, bytes: number): Promise<Uint8Array | null>
  open(pathname: string): Promise<StoredBlob | null>
  remove(pathname: string): Promise<void>
  /** One page of blobs under a prefix. */
  list(prefix: string, cursor?: string): Promise<{ blobs: Array<{ pathname: string; uploadedAt: Date }>; cursor: string | null }>
}

export function blobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    console.error('[security-checks] BLOB_READ_WRITE_TOKEN is not configured')
    throw new SecurityChecksError('File storage is unavailable right now. Try again later.', 503)
  }
  return token
}

async function readFirstBytes(stream: ReadableStream<Uint8Array>, bytes: number): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < bytes) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      total += value.length
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const result = new Uint8Array(Math.min(total, bytes))
  let offset = 0
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.min(chunk.length, result.length - offset))
    result.set(slice, offset)
    offset += slice.length
    if (offset >= result.length) break
  }
  return result
}

export function vercelBlobStore(): BlobStore {
  return {
    async head(pathname) {
      try {
        const result = await head(pathname, { token: blobToken() })
        return { size: result.size, contentType: result.contentType }
      } catch (error) {
        if (error instanceof SecurityChecksError) throw error
        return null
      }
    },
    async readPrefix(pathname, bytes) {
      const result = await get(pathname, { access: 'private', token: blobToken() })
      if (!result || result.statusCode !== 200) return null
      return readFirstBytes(result.stream, bytes)
    },
    async open(pathname) {
      const result = await get(pathname, { access: 'private', token: blobToken() })
      if (!result || result.statusCode !== 200) return null
      return { stream: result.stream, contentType: result.blob.contentType, size: result.blob.size }
    },
    async remove(pathname) {
      await del(pathname, { token: blobToken() })
    },
    async list(prefix, cursor) {
      const page = await list({ prefix, cursor, limit: 1000, token: blobToken() })
      return { blobs: page.blobs.map((blob) => ({ pathname: blob.pathname, uploadedAt: blob.uploadedAt })), cursor: page.hasMore ? (page.cursor ?? null) : null }
    },
  }
}
