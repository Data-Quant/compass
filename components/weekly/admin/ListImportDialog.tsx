'use client'

// HR imports the round's lists from a spreadsheet (UX spec, HR step 2): a preview of every change first, then save.
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import type { ListImportResult } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const MAX_BYTES = 2 * 1024 * 1024

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function ListImportDialog({ cycleId, onClose, onSaved }: { cycleId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ListImportResult | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(apply: boolean) {
    if (!file) return
    if (file.size > MAX_BYTES) {
      toast.error('The file is larger than 2 MB')
      return
    }
    setBusy(true)
    try {
      const result = await weeklyRequest<ListImportResult>('/api/admin/weekly/round-people/import', { method: 'POST', body: { cycleId, fileName: file.name, data: await toBase64(file), apply } })
      if (apply) {
        toast.success(`${result.changes.length} ${result.changes.length === 1 ? 'change' : 'changes'} saved to the round`)
        onClose()
        await onSaved()
      } else setPreview(result)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not read the file'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Import lists from a spreadsheet">
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          A .csv or .xlsx with a Name column, then Team Lead 1, Peer 1, Reporting Team Member 1 and so on. Each row is the truth for that person: anyone it leaves out is removed from their lists. Changes go to this round only, and nobody is emailed.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="list-file">File</Label>
          <Input id="list-file" type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null) }} />
        </div>
        {preview && (
          <div className="space-y-2">
            <p>{preview.rows} rows read · {preview.changes.length} {preview.changes.length === 1 ? 'change' : 'changes'}</p>
            {preview.unknownNames.length > 0 && (
              <p className="text-amber-700 dark:text-amber-400">Not found, so skipped: {preview.unknownNames.join(', ')}</p>
            )}
            {preview.changes.length === 0 ? <p className="text-muted-foreground">The lists already match the file.</p> : (
              <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
                {preview.changes.map((c) => (
                  <li key={`${c.action}-${c.relation}-${c.person.id}-${c.other.id}`} className="flex items-center gap-2">
                    <Badge variant={c.action === 'ADD' ? 'secondary' : 'outline'}>{c.action === 'ADD' ? 'Add' : 'Remove'}</Badge>
                    <span>{c.relation === 'LEAD' ? `${c.other.name} as ${c.person.name}’s lead` : `${c.person.name} and ${c.other.name} as peers`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {preview && preview.changes.length > 0
            ? <Button disabled={busy} onClick={() => void send(true)}>Save {preview.changes.length} {preview.changes.length === 1 ? 'change' : 'changes'}</Button>
            : <Button disabled={busy || !file} onClick={() => void send(false)}>{busy ? 'Reading…' : 'Preview'}</Button>}
        </div>
      </div>
    </Modal>
  )
}
