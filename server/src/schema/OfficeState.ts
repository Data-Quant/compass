import { Schema } from '@colyseus/schema'

// Minimal schema — all state sync happens via messages to avoid
// @colyseus/schema version mismatch between client and server.
export class OfficeState extends Schema {}
