import 'dotenv/config'
import { Server } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { monitor } from '@colyseus/monitor'
import express from 'express'
import cors from 'cors'
import { OfficeRoom } from './rooms/OfficeRoom'

const PORT = Number(process.env.PORT) || 2567
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000'
const corsOrigins = CORS_ORIGIN.split(',').map((o) => o.trim())

const app = express()

app.use(cors({ origin: corsOrigins }))
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// Colyseus monitor (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use('/monitor', monitor())
}

const server = new Server({
  transport: new WebSocketTransport({ server: app.listen(PORT) }),
})

server.define('office', OfficeRoom)

console.log(`[Colyseus] Office server listening on port ${PORT}`)
console.log(`[Colyseus] CORS origin: ${CORS_ORIGIN}`)
console.log(`[Colyseus] Monitor: http://localhost:${PORT}/monitor`)
