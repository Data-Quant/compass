'use client'

import { useId, useRef, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  EVIDENCE_ACCEPT_ATTRIBUTE,
  evidencePathPrefix,
  extensionOf,
  safeStorageName,
  validateEvidenceContent,
  validateEvidenceMeta,
} from '@/lib/security-checks/evidence'
import { errorMessage, scRequest } from './sc-api'

interface EvidenceUploaderProps {
  taskId: string
  subtaskId: string
  uploadedThisRound: number
  fileLimit: number
  onUploaded: () => void
}

/** Client-side checks mirror the server; the server re-validates everything and deletes failures. */
export function EvidenceUploader({ taskId, subtaskId, uploadedThisRound, fileLimit, onUploaded }: EvidenceUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const checkboxId = useId()
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setError(null)
    const meta = validateEvidenceMeta({ fileName: file.name, contentType: file.type, size: file.size }, uploadedThisRound, fileLimit)
    if (!meta.ok) return setError(meta.error)
    const contentError = validateEvidenceContent(meta.mime, new Uint8Array(await file.slice(0, 16).arrayBuffer()))
    if (contentError) return setError(contentError)
    setBusy(true)
    try {
      const pathname = `${evidencePathPrefix(taskId, subtaskId)}${safeStorageName(file.name)}.${extensionOf(file.name)}`
      const blob = await upload(pathname, file, {
        access: 'private',
        handleUploadUrl: `/api/security-checks/tasks/${taskId}/upload`,
        contentType: meta.mime,
        clientPayload: JSON.stringify({ taskId, subtaskId, fileName: file.name, contentType: meta.mime, size: file.size, prohibitedAcknowledged: true }),
      })
      await scRequest(`/api/security-checks/tasks/${taskId}/evidence`, { method: 'POST', body: { subtaskId, pathname: blob.pathname, fileName: file.name } })
      setAcknowledged(false)
      onUploaded()
    } catch (e: unknown) {
      setError(errorMessage(e, 'The upload failed. Check the file and try again.'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const atLimit = uploadedThisRound >= fileLimit
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Checkbox id={checkboxId} checked={acknowledged} onCheckedChange={(value) => setAcknowledged(value === true)} disabled={busy || atLimit} />
        <Label htmlFor={checkboxId} className="text-sm font-normal leading-snug text-muted-foreground">
          This file shows no MFA/OTP or backup codes, QR codes, authenticator secrets or passwords.
        </Label>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={EVIDENCE_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={!acknowledged || busy || atLimit} onClick={() => inputRef.current?.click()}>
        <Upload className="mr-2 h-4 w-4" aria-hidden />
        {busy ? 'Uploading…' : atLimit ? `Limit of ${fileLimit} reached` : 'Add screenshot or PDF'}
      </Button>
      <p className="text-xs text-muted-foreground">PNG, JPG or PDF, up to 10 MB each, {fileLimit} per item.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
