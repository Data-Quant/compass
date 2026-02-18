'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AssetAssignee, AssetItem } from './types'

interface AssignAssetModalProps {
  isOpen: boolean
  mode: 'assign' | 'unassign'
  asset: AssetItem | null
  users: AssetAssignee[]
  submitting?: boolean
  onClose: () => void
  onAssign: (employeeId: string, note?: string) => Promise<void>
  onUnassign: (note?: string, setStatus?: 'IN_STOCK' | 'IN_REPAIR') => Promise<void>
}

export function AssignAssetModal({
  isOpen,
  mode,
  asset,
  users,
  submitting = false,
  onClose,
  onAssign,
  onUnassign,
}: AssignAssetModalProps) {
  const [employeeId, setEmployeeId] = useState('')
  const [note, setNote] = useState('')
  const [setStatus, setSetStatus] = useState<'IN_STOCK' | 'IN_REPAIR'>('IN_STOCK')

  useEffect(() => {
    if (isOpen) {
      setEmployeeId('')
      setNote('')
      setSetStatus('IN_STOCK')
    }
  }, [isOpen, mode])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'assign') {
      if (!employeeId) return
      await onAssign(employeeId, note || undefined)
      return
    }
    await onUnassign(note || undefined, setStatus)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'assign' ? 'Assign Asset' : 'Unassign Asset'}
      size="md"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm text-muted-foreground">
          {asset ? (
            <>
              <span className="font-medium text-foreground">{asset.assetName}</span>
              {' · '}
              <span className="font-mono">{asset.equipmentId}</span>
            </>
          ) : (
            'No asset selected'
          )}
        </div>

        {mode === 'assign' ? (
          <div>
            <Label className="mb-2">Assign to</Label>
            <Select value={employeeId || '__none__'} onValueChange={(value) => setEmployeeId(value === '__none__' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select employee...</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}{user.department ? ` (${user.department})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div>
            <Label className="mb-2">Status after unassign</Label>
            <Select value={setStatus} onValueChange={(value: 'IN_STOCK' | 'IN_REPAIR') => setSetStatus(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_STOCK">In Stock</SelectItem>
                <SelectItem value="IN_REPAIR">In Repair</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label className="mb-2">Note (optional)</Label>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === 'assign' ? 'Assignment note...' : 'Return note...'}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || (mode === 'assign' && !employeeId)}>
            {submitting ? 'Saving...' : mode === 'assign' ? 'Assign' : 'Unassign'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

