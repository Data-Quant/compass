'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { WarrantyBadge } from './WarrantyBadge'
import type { AssetItem } from './types'

const STATUS_CLASS: Record<string, string> = {
  IN_STOCK: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
  ASSIGNED: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  IN_REPAIR: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  RETIRED: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
  LOST: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  DISPOSED: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300',
}

const CONDITION_CLASS: Record<string, string> = {
  NEW: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  GOOD: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  FAIR: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  DAMAGED: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
}

interface AssetTableProps {
  items: AssetItem[]
  detailBasePath: string
  onAssign: (item: AssetItem) => void
  onUnassign: (item: AssetItem) => void
}

export function AssetTable({ items, detailBasePath, onAssign, onUnassign }: AssetTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No assets found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment ID</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Warranty</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.equipmentId}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">{item.assetName}</p>
                      <p className="text-xs text-muted-foreground">
                        {[item.category, item.brand, item.model].filter(Boolean).join(' · ') || 'No metadata'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_CLASS[item.status] || STATUS_CLASS.IN_STOCK}>
                      {item.status.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={CONDITION_CLASS[item.condition] || CONDITION_CLASS.GOOD}>
                      {item.condition}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.currentAssignee ? (
                      <div className="text-sm">
                        <p className="font-medium">{item.currentAssignee.name}</p>
                        <p className="text-xs text-muted-foreground">{item.currentAssignee.department || 'No dept'}</p>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <WarrantyBadge warrantyEndDate={item.warrantyEndDate} />
                  </TableCell>
                  <TableCell>
                    {item.purchaseCost !== null
                      ? `${item.purchaseCurrency || 'PKR'} ${item.purchaseCost.toLocaleString()}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`${detailBasePath}/${item.id}`}>View</Link>
                      </Button>
                      {item.currentAssignee ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onUnassign(item)}
                        >
                          Unassign
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => onAssign(item)}>
                          Assign
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

