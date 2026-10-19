import type { PeerChangeStatus } from '@prisma/client'

/** Change requests still waiting for someone: a lead or HR to decide, or the requester to answer HR's question. */
export const OPEN_REQUEST_STATUSES: PeerChangeStatus[] = ['PENDING', 'NEEDS_INFO']
