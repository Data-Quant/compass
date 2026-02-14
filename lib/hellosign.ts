/**
 * Dropbox Sign (HelloSign) API client.
 *
 * Uses the REST API directly (v3) with API key authentication.
 * Docs: https://developers.hellosign.com/api/reference
 */

import { getHelloSignRuntimeConfig } from '@/lib/payroll/config'

const HELLOSIGN_API_BASE = 'https://api.hellosign.com/v3'

/* ---------- helpers ---------- */

function authHeaders() {
  const cfg = getHelloSignRuntimeConfig()
  if (!cfg.ready) {
    throw new Error(`HelloSign is not configured. Missing: ${cfg.missing.join(', ')}`)
  }
  // Basic auth: apiKey as username, empty password
  const encoded = Buffer.from(`${cfg.apiKey}:`).toString('base64')
  return { Authorization: `Basic ${encoded}` }
}

/* ---------- Send signature request with file buffer ---------- */

export interface HelloSignSendPayload {
  /** The PDF file buffer to send for signing */
  fileBuffer: Buffer
  /** Filename for the uploaded PDF */
  fileName: string
  /** Signer name */
  signerName: string
  /** Signer email */
  signerEmail: string
  /** Subject line for the signing email */
  subject: string
  /** Message body in the signing email */
  message?: string
  /** Use test mode (no real emails sent) */
  testMode?: boolean
}

export interface HelloSignSendResult {
  signatureRequestId: string
  status: string
  signingUrl?: string
}

export async function sendHelloSignRequest(payload: HelloSignSendPayload): Promise<HelloSignSendResult> {
  const cfg = getHelloSignRuntimeConfig()
  const headers = authHeaders()

  const formData = new FormData()
  formData.append('title', payload.subject)
  formData.append('subject', payload.subject)
  if (payload.message) formData.append('message', payload.message)
  formData.append('signers[0][name]', payload.signerName)
  formData.append('signers[0][email_address]', payload.signerEmail)

  // If a client ID is configured, include it
  if (cfg.clientId) {
    formData.append('client_id', cfg.clientId)
  }

  formData.append(
    'test_mode',
    payload.testMode ?? cfg.testMode ? '1' : '0',
  )

  // Attach the PDF as file[0]
  const blob = new Blob([new Uint8Array(payload.fileBuffer)], { type: 'application/pdf' })
  formData.append('file[0]', blob, payload.fileName)

  const response = await fetch(`${HELLOSIGN_API_BASE}/signature_request/send`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`HelloSign send failed: ${response.status} ${text}`)
  }

  const json = await response.json()
  const sr = json.signature_request

  return {
    signatureRequestId: sr?.signature_request_id || '',
    status: sr?.is_complete ? 'completed' : 'sent',
    signingUrl: sr?.signing_url || undefined,
  }
}

/* ---------- Get signature request status ---------- */

export interface HelloSignRequestStatus {
  signatureRequestId: string
  title: string
  isComplete: boolean
  isDeclined: boolean
  hasError: boolean
  status: string
  signatures: Array<{
    signatureId: string
    signerName: string
    signerEmail: string
    statusCode: string
    signedAt: string | null
    lastViewedAt: string | null
  }>
}

export async function getHelloSignRequestStatus(
  signatureRequestId: string,
): Promise<HelloSignRequestStatus> {
  const headers = authHeaders()

  const response = await fetch(
    `${HELLOSIGN_API_BASE}/signature_request/${signatureRequestId}`,
    { headers },
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`HelloSign status fetch failed: ${response.status} ${text}`)
  }

  const json = await response.json()
  const sr = json.signature_request

  const signatures = (sr?.signatures || []).map((sig: any) => ({
    signatureId: sig.signature_id || '',
    signerName: sig.signer_name || '',
    signerEmail: sig.signer_email_address || '',
    statusCode: sig.status_code || '',
    signedAt: sig.signed_at || null,
    lastViewedAt: sig.last_viewed_at || null,
  }))

  // Derive overall status
  let status = 'sent'
  if (sr?.is_complete) status = 'completed'
  else if (sr?.is_declined) status = 'declined'
  else if (sr?.has_error) status = 'error'
  else if (signatures.some((s: any) => s.statusCode === 'signed')) status = 'partially_signed'

  return {
    signatureRequestId: sr?.signature_request_id || signatureRequestId,
    title: sr?.title || '',
    isComplete: sr?.is_complete || false,
    isDeclined: sr?.is_declined || false,
    hasError: sr?.has_error || false,
    status,
    signatures,
  }
}

/* ---------- Cancel signature request ---------- */

export async function cancelHelloSignRequest(signatureRequestId: string): Promise<void> {
  const headers = authHeaders()

  const response = await fetch(
    `${HELLOSIGN_API_BASE}/signature_request/cancel/${signatureRequestId}`,
    { method: 'POST', headers },
  )

  // 200 = success, 410 = already cancelled/completed
  if (!response.ok && response.status !== 410) {
    const text = await response.text()
    throw new Error(`HelloSign cancel failed: ${response.status} ${text}`)
  }
}
