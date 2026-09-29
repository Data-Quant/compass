'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Paperclip, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { uploadPrecheck } from '@/lib/kpi/evidence'
import type { EvidenceFileView } from '@/lib/kpi/view-types'
import { errorMessage, kpiUpload } from './kpi-api'

interface UploadResponse { success: true; file: EvidenceFileView; kpiVersion: number }

interface EvidenceFilesProps {
  kpiId: string
  files: EvidenceFileView[]
  canUpload: boolean
  /** Uploading can save a pending lock, so callers take the KPI's new version from here. */
  onUploaded?: (file: EvidenceFileView, kpiVersion: number) => void
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function EvidenceFiles({ kpiId, files, canUpload, onUploaded }: EvidenceFilesProps) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    // Vercel refuses bodies over 4.5 MB before our code runs, so check here first.
    const problem = uploadPrecheck(file.name, file.size)
    if (problem) {
      toast.error(problem)
      return
    }
    setUploading(true)
    try {
      const result = await kpiUpload<UploadResponse>(`/api/kpi/kpis/${kpiId}/files`, file)
      toast.success('File added')
      onUploaded?.(result.file, result.kpiVersion)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not upload the file'))
    } finally {
      setUploading(false)
    }
  }

  if (files.length === 0 && !canUpload) return null
  return (
    <div className="space-y-1">
      {files.map((file) => (
        <a key={file.id} href={`/api/kpi/files/${file.id}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
          <Paperclip className="h-3 w-3" /> {file.fileName} ({formatSize(file.size)})
        </a>
      ))}
      {canUpload && (
        <>
          <input
            ref={input}
            type="file"
            className="hidden"
            aria-label="Evidence file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx,.csv"
            onChange={upload}
          />
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => input.current?.click()}>
            <Upload className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload file (4 MB max)'}
          </Button>
        </>
      )}
    </div>
  )
}
